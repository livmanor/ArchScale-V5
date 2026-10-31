-- Complete platform onboarding and support-grant workflows without runtime table writes.

CREATE OR REPLACE FUNCTION public.fn_platform_invite_tenant_admin_with_hash(
    p_target_org_id UUID,
    p_target_email TEXT,
    p_token_hash TEXT,
    p_invitation_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_context_id UUID;
    v_actor_membership_id UUID;
    v_clean_email TEXT;
    v_expires_at TIMESTAMPTZ;
    v_invitation_id UUID;
BEGIN
    v_context_id := fn_current_context_id();
    IF v_context_id IS NULL OR NOT is_context_valid(v_context_id) THEN
        RAISE EXCEPTION 'AUTH_CONTEXT_INVALID' USING ERRCODE = 'P0001';
    END IF;
    PERFORM fn_assert_not_support_context();
    IF NOT ('platform.organisations.manage' = ANY(fn_get_effective_permissions())) THEN
        RAISE EXCEPTION 'AUTH_PERMISSION_DENIED' USING ERRCODE = '42501';
    END IF;
    IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'AUTH_INVITATION_TOKEN_HASH_INVALID' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.organisations
        WHERE id = p_target_org_id AND portal = 'subscriber'
    ) THEN
        RAISE EXCEPTION 'AUTH_ORGANISATION_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    v_clean_email := lower(trim(p_target_email));
    IF v_clean_email = '' OR position('@' IN v_clean_email) = 0 THEN
        RAISE EXCEPTION 'AUTH_INVALID_EMAIL' USING ERRCODE = '22023';
    END IF;
    v_expires_at := COALESCE(p_invitation_expires_at, now() + interval '7 days');
    IF v_expires_at <= now() OR v_expires_at > now() + interval '30 days' THEN
        RAISE EXCEPTION 'AUTH_INVITATION_EXPIRY_INVALID' USING ERRCODE = '22023';
    END IF;

    v_actor_membership_id := fn_current_context_membership_id();
    INSERT INTO public.invitations (
        email, organisation_id, target_role_key, department, job_role,
        invited_by_membership_id, token_hash, invitation_expires_at,
        expires_at, status
    ) VALUES (
        v_clean_email, p_target_org_id, 'business_owner', 'Management', 'Tenant Admin',
        v_actor_membership_id, p_token_hash, v_expires_at, v_expires_at, 'Pending'
    ) RETURNING id INTO v_invitation_id;

    PERFORM fn_audit_append(
        'platform.org.admin_invited', 'invitations', v_invitation_id::text,
        jsonb_build_object('target_org_id', p_target_org_id, 'email', v_clean_email)
    );
    RETURN v_invitation_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_platform_invite_tenant_admin_with_hash(UUID,TEXT,TEXT,TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_platform_invite_tenant_admin_with_hash(UUID,TEXT,TEXT,TIMESTAMPTZ) TO archscale_app_runtime;

CREATE OR REPLACE FUNCTION public.fn_list_platform_support_grants()
RETURNS TABLE (
    id UUID,
    target_organisation_id UUID,
    target_organisation_name TEXT,
    reason TEXT,
    started_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    grant_status TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_context_id UUID;
    v_actor_membership_id UUID;
BEGIN
    v_context_id := fn_current_context_id();
    IF v_context_id IS NULL OR NOT is_context_valid(v_context_id) THEN
        RAISE EXCEPTION 'AUTH_CONTEXT_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF fn_current_context_portal() <> 'platform'::public.portal_type THEN
        RAISE EXCEPTION 'AUTH_PORTAL_DENIED' USING ERRCODE = '42501';
    END IF;
    IF NOT ('platform.support.manage' = ANY(fn_get_effective_permissions())) THEN
        RAISE EXCEPTION 'AUTH_PERMISSION_DENIED' USING ERRCODE = '42501';
    END IF;

    v_actor_membership_id := fn_current_context_membership_id();
    RETURN QUERY
    SELECT g.id, g.target_organisation_id, o.name, g.reason, g.started_at, g.expires_at, g.revoked_at,
        CASE WHEN g.revoked_at IS NOT NULL THEN 'REVOKED'
             WHEN g.expires_at <= now() THEN 'EXPIRED'
             ELSE 'ACTIVE' END
    FROM public.support_access_grants g
    JOIN public.organisations o ON o.id = g.target_organisation_id
    WHERE g.staff_membership_id = v_actor_membership_id
    ORDER BY g.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_list_platform_support_grants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_list_platform_support_grants() TO archscale_app_runtime;
