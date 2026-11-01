CREATE OR REPLACE FUNCTION public.fn_attendance_self_access(
    p_organisation_id UUID,
    p_workspace_id UUID,
    p_membership_id UUID,
    p_department TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_context_id UUID;
BEGIN
    v_context_id := NULLIF(current_setting('archscale.current_context_id', true), '')::uuid;
    IF v_context_id IS NULL OR NOT public.is_context_valid(v_context_id) THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
          FROM public.access_contexts ac
          JOIN public.memberships m ON m.id = ac.membership_id
          JOIN public.organisation_entitlements e
            ON e.organisation_id = ac.organisation_id
           AND e.app_key = 'attendance'
           AND e.is_enabled
         WHERE ac.id = v_context_id
           AND ac.organisation_id = p_organisation_id
           AND ac.workspace_id = p_workspace_id
           AND ac.membership_id = p_membership_id
           AND m.department IS NOT DISTINCT FROM p_department
           AND m.status = 'ACTIVE'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_attendance_self_access(UUID, UUID, UUID, TEXT) TO archscale_app_runtime;

DROP POLICY IF EXISTS attendance_self_select_policy ON public.attendance_records;
CREATE POLICY attendance_self_select_policy ON public.attendance_records FOR SELECT TO archscale_app_runtime
USING (public.fn_attendance_self_access(organisation_id, workspace_id, membership_id, department));

DROP POLICY IF EXISTS attendance_self_insert_policy ON public.attendance_records;
CREATE POLICY attendance_self_insert_policy ON public.attendance_records FOR INSERT TO archscale_app_runtime
WITH CHECK (
    public.fn_attendance_self_access(organisation_id, workspace_id, membership_id, department)
    AND attendance_date = CURRENT_DATE
    AND check_in IS NOT NULL
    AND check_out IS NULL
    AND status = 'Present'
    AND remarks = ''
    AND created_by_membership_id = membership_id
    AND last_updated_by_membership_id = membership_id
);

DROP POLICY IF EXISTS attendance_self_update_policy ON public.attendance_records;
CREATE POLICY attendance_self_update_policy ON public.attendance_records FOR UPDATE TO archscale_app_runtime
USING (
    public.fn_attendance_self_access(organisation_id, workspace_id, membership_id, department)
    AND attendance_date = CURRENT_DATE
    AND check_in IS NOT NULL
    AND check_out IS NULL
)
WITH CHECK (
    public.fn_attendance_self_access(organisation_id, workspace_id, membership_id, department)
    AND attendance_date = CURRENT_DATE
    AND check_in IS NOT NULL
    AND check_out IS NOT NULL
);

CREATE OR REPLACE FUNCTION public.fn_attendance_self_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.fn_app_record_allowed(
        'attendance', 'edit', OLD.organisation_id, OLD.department,
        OLD.membership_id, OLD.membership_id
    ) THEN
        IF NOT public.fn_attendance_self_access(
            OLD.organisation_id, OLD.workspace_id, OLD.membership_id, OLD.department
        )
        OR OLD.attendance_date <> CURRENT_DATE
        OR OLD.check_in IS NULL
        OR OLD.check_out IS NOT NULL
        OR NEW.check_out IS NULL
        OR NEW.check_out IS DISTINCT FROM LOCALTIME(0)
        OR (NEW.attendance_id, NEW.department, NEW.attendance_date, NEW.check_in, NEW.status,
            NEW.remarks, NEW.membership_id, NEW.organisation_id, NEW.workspace_id,
            NEW.created_by_membership_id)
           IS DISTINCT FROM
           (OLD.attendance_id, OLD.department, OLD.attendance_date, OLD.check_in, OLD.status,
            OLD.remarks, OLD.membership_id, OLD.organisation_id, OLD.workspace_id,
            OLD.created_by_membership_id)
        THEN
            RAISE EXCEPTION 'Members may only check out of their own current-day attendance record';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_self_update_guard ON public.attendance_records;
CREATE TRIGGER attendance_self_update_guard
    BEFORE UPDATE ON public.attendance_records
    FOR EACH ROW EXECUTE FUNCTION public.fn_attendance_self_update_guard();

GRANT INSERT ON public.attendance_records TO archscale_app_runtime;
