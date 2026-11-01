-- =============================================================================
-- Migration 022: Attendance Schema Harmonisation & Universal Self-Service Check-In
-- =============================================================================
-- Ensures attendance_records and tasks have proper column defaults and nullability
-- so any active tenant member (e.g. intern, business_owner, designer) can record
-- their own attendance without schema constraint errors or missing runtime permissions.
-- =============================================================================

-- 1. Ensure attendance_records legacy columns are nullable and have default values
ALTER TABLE public.attendance_records
    ALTER COLUMN tenant_id DROP NOT NULL,
    ALTER COLUMN date DROP NOT NULL,
    ALTER COLUMN department DROP NOT NULL,
    ALTER COLUMN department SET DEFAULT 'General',
    ALTER COLUMN attendance_id SET DEFAULT ('ATT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)));

-- 2. Ensure tasks legacy columns are nullable
ALTER TABLE public.tasks
    ALTER COLUMN tenant_id DROP NOT NULL,
    ALTER COLUMN work_id DROP NOT NULL,
    ALTER COLUMN task_title DROP NOT NULL;

-- 3. Update the actor-binding trigger to synchronise legacy columns and defaults
CREATE OR REPLACE FUNCTION public.fn_app_bind_record_actor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_context UUID;
    v_actor UUID;
    v_org UUID;
    v_workspace UUID;
BEGIN
    v_context := NULLIF(current_setting('archscale.current_context_id', true), '')::uuid;
    IF v_context IS NULL OR NOT public.is_context_valid(v_context) THEN
        RAISE EXCEPTION 'Record write denied: active context missing or invalid';
    END IF;
    SELECT organisation_id, workspace_id, membership_id
      INTO v_org, v_workspace, v_actor
      FROM public.access_contexts
     WHERE id = v_context;

    IF TG_TABLE_NAME = 'tasks' THEN
        IF TG_OP = 'INSERT' THEN
            NEW.created_by_membership_id := v_actor;
            NEW.organisation_id := v_org;
            NEW.workspace_id := v_workspace;
            NEW.tenant_id := v_org;
            NEW.work_id := COALESCE(NEW.work_id, 'WRK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)));
            NEW.task_title := COALESCE(NEW.task_title, NEW.title);
        ELSIF NEW.organisation_id <> OLD.organisation_id OR NEW.workspace_id <> OLD.workspace_id OR NEW.created_by_membership_id <> OLD.created_by_membership_id THEN
            RAISE EXCEPTION 'Task creator and tenant scope are immutable';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.memberships m WHERE m.id = NEW.assigned_to_membership_id AND m.organisation_id = v_org AND m.status = 'ACTIVE')
           OR NOT EXISTS (SELECT 1 FROM public.memberships m WHERE m.id = NEW.reviewer_membership_id AND m.organisation_id = v_org AND m.status = 'ACTIVE') THEN
            RAISE EXCEPTION 'Task assignee and reviewer must be active members of the current tenant';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.memberships m WHERE m.id = NEW.assigned_to_membership_id AND m.department = NEW.department) THEN
            RAISE EXCEPTION 'Task department must match the assignee department';
        END IF;
        RETURN NEW;
    ELSIF TG_TABLE_NAME = 'attendance_records' THEN
        IF TG_OP = 'INSERT' THEN
            NEW.organisation_id := v_org;
            NEW.workspace_id := v_workspace;
            NEW.created_by_membership_id := v_actor;
            NEW.last_updated_by_membership_id := v_actor;
            NEW.tenant_id := v_org;
            NEW.date := COALESCE(NEW.attendance_date, CURRENT_DATE);
            NEW.department := COALESCE(NEW.department, 'General');
            NEW.attendance_id := COALESCE(NEW.attendance_id, 'ATT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)));
        ELSE
            IF NEW.organisation_id <> OLD.organisation_id OR NEW.workspace_id <> OLD.workspace_id OR NEW.membership_id <> OLD.membership_id OR NEW.created_by_membership_id <> OLD.created_by_membership_id THEN
                RAISE EXCEPTION 'Attendance identity and ownership are immutable';
            END IF;
            NEW.last_updated_by_membership_id := v_actor;
            NEW.updated_at := now();
        END IF;
        RETURN NEW;
    ELSE
        SELECT membership_id INTO NEW.author_membership_id FROM public.access_contexts WHERE id = v_context;
        RETURN NEW;
    END IF;
END; $$;

-- 4. Update fn_attendance_self_access to handle null departments gracefully
CREATE OR REPLACE FUNCTION public.fn_attendance_self_access(
    p_organisation_id UUID,
    p_workspace_id UUID,
    p_membership_id UUID,
    p_department TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
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
           AND COALESCE(m.department, 'General') = COALESCE(p_department, 'General')
           AND m.status = 'ACTIVE'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_attendance_self_access(UUID, UUID, UUID, TEXT) TO archscale_app_runtime;

-- 5. Member self-select policy: members can see all their own records across dates
DROP POLICY IF EXISTS attendance_self_select_policy ON public.attendance_records;
CREATE POLICY attendance_self_select_policy ON public.attendance_records FOR SELECT TO archscale_app_runtime
USING (
    public.fn_attendance_self_access(organisation_id, workspace_id, membership_id, department)
);

-- 6. Self-insert policy for current-day check-in
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

-- 7. Grant INSERT, SELECT, UPDATE to archscale_app_runtime
GRANT INSERT, SELECT, UPDATE ON public.attendance_records TO archscale_app_runtime;

-- 8. Ensure all subscriber organisations have attendance and tasks enabled
INSERT INTO public.organisation_entitlements (organisation_id, app_key, is_enabled)
SELECT o.id, a.app_key, true
  FROM public.organisations o
  CROSS JOIN (VALUES ('attendance'), ('tasks')) AS a(app_key)
 WHERE o.portal = 'subscriber'
ON CONFLICT (organisation_id, app_key) DO UPDATE SET is_enabled = true;
