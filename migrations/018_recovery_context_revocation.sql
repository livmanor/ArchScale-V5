-- Revoke all application contexts after the identity provider validates a recovery token.
-- The application must pass only the user id returned by the provider's verified reset flow.
CREATE OR REPLACE FUNCTION public.fn_revoke_user_access_contexts(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_revoked_count INTEGER;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_USER_REQUIRED' USING ERRCODE = '22023';
    END IF;

    UPDATE public.access_contexts
       SET revoked_at = now()
     WHERE user_id = p_user_id
       AND revoked_at IS NULL;

    GET DIAGNOSTICS v_revoked_count = ROW_COUNT;
    RETURN v_revoked_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_revoke_user_access_contexts(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_revoke_user_access_contexts(UUID) TO archscale_app_runtime;
