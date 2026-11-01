-- =============================================================================
-- Migration 021: Platform RBAC Role-Permission Management Functions & Policies
-- ArchScale V05 Authentication & Authorisation Layer
-- =============================================================================

-- 1. Grant archscale_app_runtime INSERT & DELETE on role_permissions
GRANT SELECT, INSERT, DELETE ON public.role_permissions TO archscale_app_runtime;

-- 2. Create RLS policies for role_permissions runtime modification
DROP POLICY IF EXISTS role_permissions_runtime_insert ON public.role_permissions;
CREATE POLICY role_permissions_runtime_insert ON public.role_permissions
    FOR INSERT TO archscale_app_runtime
    WITH CHECK (true);

DROP POLICY IF EXISTS role_permissions_runtime_delete ON public.role_permissions;
CREATE POLICY role_permissions_runtime_delete ON public.role_permissions
    FOR DELETE TO archscale_app_runtime
    USING (true);

-- 3. Security definer helper functions for platform role permission governance
CREATE OR REPLACE FUNCTION fn_platform_grant_role_permission(
    p_role_key TEXT,
    p_permission_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
    -- Validate role and permission exist
    IF NOT EXISTS (SELECT 1 FROM public.roles WHERE key = p_role_key) THEN
        RAISE EXCEPTION 'ROLE_NOT_FOUND: Role % does not exist', p_role_key USING ERRCODE = 'P0002';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE key = p_permission_key) THEN
        RAISE EXCEPTION 'PERMISSION_NOT_FOUND: Permission % does not exist', p_permission_key USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.role_permissions (role_key, permission_key)
    VALUES (p_role_key, p_permission_key)
    ON CONFLICT (role_key, permission_key) DO NOTHING;

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION fn_platform_revoke_role_permission(
    p_role_key TEXT,
    p_permission_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
    -- Safety invariant: Founder cannot lose core root permissions
    IF p_role_key = 'founder' AND p_permission_key IN ('platform.roles.manage', 'platform.organisations.manage', 'platform.organisations.approve') THEN
        RAISE EXCEPTION 'PROTECTED_PERMISSION: Cannot remove core governance permissions from Founder role' USING ERRCODE = '22023';
    END IF;

    DELETE FROM public.role_permissions
    WHERE role_key = p_role_key AND permission_key = p_permission_key;

    RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_platform_grant_role_permission(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_platform_grant_role_permission(TEXT, TEXT) TO archscale_app_runtime;

REVOKE EXECUTE ON FUNCTION fn_platform_revoke_role_permission(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_platform_revoke_role_permission(TEXT, TEXT) TO archscale_app_runtime;
