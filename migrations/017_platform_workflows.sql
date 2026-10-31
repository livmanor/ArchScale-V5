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
    IF NOT EXISTS (
        SELECT 1 FROM public.access_contexts ac
        JOIN public.organisations o ON o.id = ac.organisation_id
        WHERE ac.id = v_context_id AND o.portal = 'platform'
    ) THEN
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

CREATE OR REPLACE FUNCTION public.fn_platform_list_organisations()
RETURNS TABLE (
    id UUID,
    name TEXT,
    portal public.portal_type,
    tenant_type_key TEXT,
    status public.org_status,
    member_min_aal TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
    IF NOT is_context_valid() THEN
        RAISE EXCEPTION 'AUTH_CONTEXT_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF NOT ('platform.organisations.read' = ANY(fn_get_effective_permissions())) THEN
        RAISE EXCEPTION 'AUTH_PERMISSION_DENIED' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT o.id, o.name, o.portal, o.tenant_type_key, o.status, o.member_min_aal, o.created_at
    FROM public.organisations o
    ORDER BY o.name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_platform_list_organisations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_platform_list_organisations() TO archscale_app_runtime;

CREATE OR REPLACE FUNCTION public.fn_platform_get_organisation(p_organisation_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    portal public.portal_type,
    tenant_type_key TEXT,
    status public.org_status,
    member_min_aal TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
    IF NOT is_context_valid() THEN
        RAISE EXCEPTION 'AUTH_CONTEXT_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF NOT ('platform.organisations.read' = ANY(fn_get_effective_permissions())) THEN
        RAISE EXCEPTION 'AUTH_PERMISSION_DENIED' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT o.id, o.name, o.portal, o.tenant_type_key, o.status, o.member_min_aal, o.created_at
    FROM public.organisations o WHERE o.id = p_organisation_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_platform_get_organisation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_platform_get_organisation(UUID) TO archscale_app_runtime;

CREATE OR REPLACE FUNCTION public.fn_platform_create_organisation(
    p_name TEXT,
    p_tenant_type_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_context_id UUID;
    v_organisation_id UUID;
BEGIN
    v_context_id := fn_current_context_id();
    IF v_context_id IS NULL OR NOT is_context_valid(v_context_id) THEN
        RAISE EXCEPTION 'AUTH_CONTEXT_INVALID' USING ERRCODE = 'P0001';
    END IF;
    PERFORM fn_assert_not_support_context();
    IF NOT ('platform.organisations.manage' = ANY(fn_get_effective_permissions())) THEN
        RAISE EXCEPTION 'AUTH_PERMISSION_DENIED' USING ERRCODE = '42501';
    END IF;
    IF p_name IS NULL OR length(btrim(p_name)) < 2 THEN
        RAISE EXCEPTION 'AUTH_ORGANISATION_NAME_REQUIRED' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tenant_types WHERE key = p_tenant_type_key AND is_active) THEN
        RAISE EXCEPTION 'AUTH_TENANT_TYPE_INVALID' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.organisations (name, portal, tenant_type_key, status, member_min_aal)
    VALUES (btrim(p_name), 'subscriber', p_tenant_type_key, 'APPLIED', 'aal2')
    RETURNING id INTO v_organisation_id;

    INSERT INTO public.workspaces (organisation_id, name, is_default, is_active)
    VALUES (v_organisation_id, 'Main Workspace', true, true);

    INSERT INTO public.organisation_entitlements (organisation_id, app_key, is_enabled)
    SELECT v_organisation_id, app_key, true
      FROM public.app_catalogue
     WHERE app_key IN ('tasks', 'attendance') AND is_active
    ON CONFLICT (organisation_id, app_key) DO NOTHING;

    PERFORM fn_audit_append(
        'platform.org.created', 'organisations', v_organisation_id::text,
        jsonb_build_object('name', btrim(p_name), 'tenant_type_key', p_tenant_type_key)
    );
    RETURN v_organisation_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_platform_create_organisation(TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_platform_create_organisation(TEXT,TEXT) TO archscale_app_runtime;

CREATE OR REPLACE FUNCTION public.fn_app_support_context_can_read(p_organisation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_context_id UUID;
    v_grant_id UUID;
    v_membership_id UUID;
    v_organisation_id UUID;
BEGIN
    v_context_id := fn_current_context_id();
    IF v_context_id IS NULL OR NOT is_context_valid(v_context_id) THEN RETURN FALSE; END IF;

    SELECT ac.support_grant_id, ac.membership_id, ac.organisation_id
      INTO v_grant_id, v_membership_id, v_organisation_id
      FROM public.access_contexts ac WHERE ac.id = v_context_id;
    IF v_grant_id IS NULL OR v_organisation_id <> p_organisation_id THEN RETURN FALSE; END IF;

    RETURN EXISTS (
        SELECT 1
          FROM public.support_access_grants sag
          JOIN public.role_permissions rp ON rp.role_key = (
              SELECT m.role_key FROM public.memberships m WHERE m.id = v_membership_id
          )
         WHERE sag.id = v_grant_id
           AND sag.staff_membership_id = v_membership_id
           AND sag.target_organisation_id = p_organisation_id
           AND sag.revoked_at IS NULL
           AND sag.expires_at > now()
           AND rp.permission_key = 'platform.support.read'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_app_support_context_can_read(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_app_support_context_can_read(UUID) TO archscale_app_runtime;

DROP POLICY IF EXISTS tasks_select_policy ON public.tasks;
CREATE POLICY tasks_select_policy ON public.tasks FOR SELECT TO archscale_app_runtime
USING (
    public.fn_app_record_allowed('tasks','read',organisation_id,department,created_by_membership_id,assigned_to_membership_id)
    OR public.fn_app_support_context_can_read(organisation_id)
);

DROP POLICY IF EXISTS attendance_select_policy ON public.attendance_records;
CREATE POLICY attendance_select_policy ON public.attendance_records FOR SELECT TO archscale_app_runtime
USING (
    public.fn_app_record_allowed('attendance','read',organisation_id,department,membership_id,membership_id)
    OR public.fn_app_support_context_can_read(organisation_id)
);

DROP POLICY IF EXISTS attendance_comment_select_policy ON public.attendance_comments;
CREATE POLICY attendance_comment_select_policy ON public.attendance_comments FOR SELECT TO archscale_app_runtime
USING (
    public.fn_app_record_allowed('attendance','read',organisation_id,NULL,NULL,NULL)
    OR public.fn_app_support_context_can_read(organisation_id)
);
