-- =============================================================================
-- Migration 020: Platform Tenant Admin Approval Scope & Primary Owner Assignment
-- =============================================================================
-- Allows platform staff (portal = 'platform', e.g. founder) to approve/activate
-- tenant administrators (business_owner) in subscriber organisations upon invitation acceptance.
-- Assigns is_primary_owner = true to the first business_owner of the tenant.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_approve_membership(
    p_request_id UUID,
    p_acting_membership_id UUID,
    p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_actor_user_id UUID;
    v_actor_org_id UUID;
    v_actor_role_key TEXT;
    v_actor_level INT;
    v_actor_org_status org_status;
    v_actor_portal portal_type;
    v_request RECORD;
    v_target_level INT;
    v_membership_id UUID;
    v_app_key TEXT;
    v_seat RECORD;
BEGIN
    -- Support contexts are strictly read-only
    PERFORM fn_assert_not_support_context();

    -- A. Re-validate acting approver authority server-side
    SELECT m.user_id, m.organisation_id, m.role_key, r.level, o.status, o.portal
    INTO v_actor_user_id, v_actor_org_id, v_actor_role_key, v_actor_level, v_actor_org_status, v_actor_portal
    FROM memberships m
    JOIN roles r ON r.key = m.role_key
    JOIN organisations o ON o.id = m.organisation_id
    WHERE m.id = p_acting_membership_id
      AND m.status = 'ACTIVE';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Acting approver membership % is not found or not active', p_acting_membership_id;
    END IF;

    IF v_actor_org_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Acting approver organisation is in % status (must be ACTIVE)', v_actor_org_status;
    END IF;

    -- B. Fetch and lock access request
    SELECT * INTO v_request
    FROM access_requests
    WHERE id = p_request_id AND request_type = 'membership' AND status = 'PENDING'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Membership access request % not found or not pending', p_request_id;
    END IF;

    -- Approver must belong to the same organisation UNLESS approver is in platform portal (e.g. founder inviting tenant admin)
    IF v_actor_org_id <> v_request.organisation_id AND v_actor_portal <> 'platform' THEN
        RAISE EXCEPTION 'Scope violation: approver organisation (%) does not match request organisation (%)',
            v_actor_org_id, v_request.organisation_id;
    END IF;

    -- C. Separation of duties
    IF v_actor_user_id = v_request.requester_user_id THEN
        RAISE EXCEPTION 'Separation of duties violation: user cannot approve their own membership request';
    END IF;

    -- D. Level ceiling check
    SELECT level INTO v_target_level FROM roles WHERE key = v_request.target_role_key;
    IF v_actor_level <= v_target_level THEN
        RAISE EXCEPTION 'Level ceiling violation: approver level (%) must be strictly greater than target role level (%)',
            v_actor_level, v_target_level;
    END IF;

    -- E. Seat Accounting Check under FOR UPDATE lock
    IF v_request.requested_apps IS NOT NULL AND array_length(v_request.requested_apps, 1) > 0 THEN
        FOREACH v_app_key IN ARRAY v_request.requested_apps
        LOOP
            SELECT * INTO v_seat
            FROM organisation_seats
            WHERE organisation_id = v_request.organisation_id
              AND app_key = v_app_key
              AND role_key = v_request.target_role_key
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'No seat capacity configured for app % and role %', v_app_key, v_request.target_role_key;
            END IF;

            IF v_seat.allocated_seats + 1 > v_seat.seat_limit THEN
                RAISE EXCEPTION 'Seat capacity exceeded for app % and role %: limit is %, allocated is %',
                    v_app_key, v_request.target_role_key, v_seat.seat_limit, v_seat.allocated_seats;
            END IF;
        END LOOP;
    END IF;

    -- F. Upsert/Activate Membership Record
    INSERT INTO memberships (
        user_id,
        organisation_id,
        role_key,
        profile_id,
        status,
        expires_at,
        is_primary_owner
    ) VALUES (
        v_request.requester_user_id,
        v_request.organisation_id,
        v_request.target_role_key,
        v_request.target_profile_id,
        'ACTIVE',
        CASE WHEN v_request.requested_duration IS NOT NULL THEN now() + v_request.requested_duration ELSE NULL END,
        CASE WHEN v_request.target_role_key = 'business_owner' AND NOT EXISTS (
            SELECT 1 FROM memberships WHERE organisation_id = v_request.organisation_id AND is_primary_owner = true
        ) THEN true ELSE false END
    )
    ON CONFLICT (user_id, organisation_id) DO UPDATE SET
        role_key = EXCLUDED.role_key,
        profile_id = EXCLUDED.profile_id,
        status = 'ACTIVE',
        expires_at = EXCLUDED.expires_at,
        is_primary_owner = CASE
            WHEN EXCLUDED.role_key = 'business_owner' AND NOT EXISTS (
                SELECT 1 FROM memberships WHERE organisation_id = memberships.organisation_id AND is_primary_owner = true AND id <> memberships.id
            ) THEN true
            ELSE memberships.is_primary_owner
        END,
        updated_at = now()
    RETURNING id INTO v_membership_id;

    -- If target organisation is in APPLIED status, transition to ACTIVE upon primary owner activation
    UPDATE organisations
    SET status = 'ACTIVE', updated_at = now()
    WHERE id = v_request.organisation_id AND status = 'APPLIED';

    -- G. Increment Seat Allocations & Bind membership_seats
    IF v_request.requested_apps IS NOT NULL AND array_length(v_request.requested_apps, 1) > 0 THEN
        FOREACH v_app_key IN ARRAY v_request.requested_apps
        LOOP
            UPDATE organisation_seats
            SET allocated_seats = allocated_seats + 1
            WHERE organisation_id = v_request.organisation_id
              AND app_key = v_app_key
              AND role_key = v_request.target_role_key;

            INSERT INTO membership_seats (membership_id, app_key)
            VALUES (v_membership_id, v_app_key)
            ON CONFLICT (membership_id, app_key) DO NOTHING;
        END LOOP;
    END IF;

    -- H. Record approval step
    INSERT INTO approval_steps (
        request_id,
        step_number,
        required_role_key,
        min_level,
        decided_by,
        decision,
        reason,
        decided_at
    ) VALUES (
        p_request_id,
        1,
        v_actor_role_key,
        v_actor_level,
        p_acting_membership_id,
        'APPROVED',
        p_reason,
        now()
    );

    -- I. Finalize request
    UPDATE access_requests
    SET status = 'APPROVED', updated_at = now()
    WHERE id = p_request_id;

    -- J. Append-only audit record
    INSERT INTO audit_logs (
        actor_user_id,
        actor_membership_id,
        organisation_id,
        action,
        target_entity,
        target_id,
        diff
    ) VALUES (
        v_actor_user_id,
        p_acting_membership_id,
        v_request.organisation_id,
        'membership.approve',
        'membership',
        v_membership_id::text,
        jsonb_build_object(
            'role_key', v_request.target_role_key,
            'requester_user_id', v_request.requester_user_id,
            'apps', v_request.requested_apps,
            'reason', p_reason
        )
    );

    RETURN v_membership_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_approve_membership(UUID, UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_approve_membership(UUID, UUID, TEXT) TO archscale_app_runtime;
