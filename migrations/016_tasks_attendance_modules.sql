-- Persistent Tasks and Attendance schema with tenant-scoped RLS.

CREATE TABLE IF NOT EXISTS public.app_authorization_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID REFERENCES public.organisations(id) ON DELETE CASCADE,
    app_key TEXT NOT NULL REFERENCES public.app_catalogue(app_key) ON DELETE CASCADE,
    action_key TEXT NOT NULL,
    role_key TEXT NOT NULL REFERENCES public.roles(key) ON DELETE CASCADE,
    department TEXT,
    job_role TEXT,
    target_scope TEXT NOT NULL CHECK (target_scope IN ('tenant', 'assignee', 'direct_reports', 'same_department', 'reviewer')),
    effect TEXT NOT NULL CHECK (effect IN ('ALLOW', 'DENY')) DEFAULT 'ALLOW',
    priority INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE NULLS NOT DISTINCT (organisation_id, app_key, action_key, role_key, department, job_role, target_scope)
);

CREATE INDEX IF NOT EXISTS app_authorization_policy_lookup
    ON public.app_authorization_policies(app_key, action_key, role_key, is_active, priority);

CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id TEXT NOT NULL UNIQUE DEFAULT ('WRK-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12))),
    organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
    title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 240),
    description TEXT NOT NULL DEFAULT '',
    assigned_to_membership_id UUID NOT NULL REFERENCES public.memberships(id) ON DELETE RESTRICT,
    department TEXT NOT NULL,
    reviewer_membership_id UUID NOT NULL REFERENCES public.memberships(id) ON DELETE RESTRICT,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_at TIMESTAMPTZ,
    priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low','Normal','High','Urgent')),
    status TEXT NOT NULL DEFAULT 'To Do' CHECK (status IN ('To Do','In Progress','In Review','Completed')),
    created_by_membership_id UUID NOT NULL REFERENCES public.memberships(id) ON DELETE RESTRICT,
    approved_by_membership_id UUID REFERENCES public.memberships(id) ON DELETE RESTRICT,
    approval_status TEXT NOT NULL DEFAULT 'Not Required' CHECK (approval_status IN ('Not Required','Pending','Approved','Rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tasks_assignees_same_org CHECK (assigned_to_membership_id <> created_by_membership_id OR organisation_id IS NOT NULL)
);

-- Upgrade the existing ArchScale task table in place when it uses tenant_id/task_title/due_date.
ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS title TEXT,
    ADD COLUMN IF NOT EXISTS reviewer_membership_id UUID REFERENCES public.memberships(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tasks' AND column_name='tenant_id') THEN
        EXECUTE 'UPDATE public.tasks SET organisation_id = tenant_id WHERE organisation_id IS NULL';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tasks' AND column_name='task_title') THEN
        EXECUTE 'UPDATE public.tasks SET title = task_title WHERE title IS NULL';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tasks' AND column_name='due_date') THEN
        EXECUTE 'UPDATE public.tasks SET due_at = due_date WHERE due_at IS NULL';
    END IF;
END $$;

UPDATE public.tasks t
     SET workspace_id = (
             SELECT w.id FROM public.workspaces w
                WHERE w.organisation_id = t.organisation_id AND w.is_active
                ORDER BY w.is_default DESC, w.created_at, w.id
                LIMIT 1
     )
 WHERE t.workspace_id IS NULL;

UPDATE public.tasks
   SET title = COALESCE(title, 'Existing task ' || work_id),
       description = COALESCE(description, ''),
       reviewer_membership_id = COALESCE(reviewer_membership_id, reporting_manager_membership_id, created_by_membership_id),
       start_date = COALESCE(start_date, created_at::date),
       approval_status = COALESCE(approval_status, 'Not Required'),
       updated_at = COALESCE(updated_at, created_at, now());

ALTER TABLE public.tasks
    ALTER COLUMN organisation_id SET NOT NULL,
    ALTER COLUMN workspace_id SET NOT NULL,
    ALTER COLUMN title SET NOT NULL,
    ALTER COLUMN reviewer_membership_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS tasks_org_workspace ON public.tasks(organisation_id, workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tasks_assignment ON public.tasks(assigned_to_membership_id, status);
CREATE INDEX IF NOT EXISTS tasks_creator ON public.tasks(created_by_membership_id);

CREATE TABLE IF NOT EXISTS public.attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_id TEXT NOT NULL UNIQUE DEFAULT ('ATT-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12))),
    organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
    membership_id UUID NOT NULL REFERENCES public.memberships(id) ON DELETE RESTRICT,
    department TEXT NOT NULL,
    attendance_date DATE NOT NULL,
    check_in TIME,
    check_out TIME,
    status TEXT NOT NULL CHECK (status IN ('Present','Absent','Half Day','Leave','Holiday','Work From Home')),
    remarks TEXT NOT NULL DEFAULT '',
    created_by_membership_id UUID NOT NULL REFERENCES public.memberships(id) ON DELETE RESTRICT,
    last_updated_by_membership_id UUID NOT NULL REFERENCES public.memberships(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organisation_id, membership_id, attendance_date)
);

-- Upgrade the existing tenant_id/date/check_in_time attendance representation in place.
ALTER TABLE public.attendance_records
    ADD COLUMN IF NOT EXISTS attendance_id TEXT,
    ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS attendance_date DATE,
    ADD COLUMN IF NOT EXISTS check_in TIME,
    ADD COLUMN IF NOT EXISTS check_out TIME;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='attendance_records' AND column_name='tenant_id') THEN
        EXECUTE 'UPDATE public.attendance_records SET organisation_id = tenant_id WHERE organisation_id IS NULL';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='attendance_records' AND column_name='date') THEN
        EXECUTE 'UPDATE public.attendance_records SET attendance_date = date WHERE attendance_date IS NULL';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='attendance_records' AND column_name='check_in_time') THEN
        EXECUTE 'UPDATE public.attendance_records SET check_in = check_in_time WHERE check_in IS NULL';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='attendance_records' AND column_name='check_out_time') THEN
        EXECUTE 'UPDATE public.attendance_records SET check_out = check_out_time WHERE check_out IS NULL';
    END IF;
END $$;

UPDATE public.attendance_records a
     SET workspace_id = (
             SELECT w.id FROM public.workspaces w
                WHERE w.organisation_id = a.organisation_id AND w.is_active
                ORDER BY w.is_default DESC, w.created_at, w.id
                LIMIT 1
     )
 WHERE a.workspace_id IS NULL;

UPDATE public.attendance_records
   SET attendance_id = COALESCE(attendance_id, 'ATT-' || upper(replace(id::text, '-', ''))),
       attendance_date = COALESCE(attendance_date, created_at::date),
       last_updated_by_membership_id = COALESCE(last_updated_by_membership_id, created_by_membership_id),
       remarks = COALESCE(remarks, ''),
       updated_at = COALESCE(updated_at, created_at, now());

ALTER TABLE public.attendance_records
    ALTER COLUMN attendance_id SET NOT NULL,
    ALTER COLUMN organisation_id SET NOT NULL,
    ALTER COLUMN workspace_id SET NOT NULL,
    ALTER COLUMN attendance_date SET NOT NULL,
    ALTER COLUMN last_updated_by_membership_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_attendance_id_key ON public.attendance_records(attendance_id);

CREATE INDEX IF NOT EXISTS attendance_org_date ON public.attendance_records(organisation_id, attendance_date DESC);
CREATE INDEX IF NOT EXISTS attendance_member_date ON public.attendance_records(membership_id, attendance_date DESC);

CREATE TABLE IF NOT EXISTS public.attendance_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_record_id UUID NOT NULL REFERENCES public.attendance_records(id) ON DELETE RESTRICT,
    organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
    author_membership_id UUID NOT NULL REFERENCES public.memberships(id) ON DELETE RESTRICT,
    body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_comments
    ADD COLUMN IF NOT EXISTS attendance_record_id UUID REFERENCES public.attendance_records(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS body TEXT;

-- The legacy comments table is append-only. Temporarily remove only its
-- mutation-rejection trigger for this schema-only backfill, then restore it.
DROP TRIGGER IF EXISTS trg_prevent_attendance_comment_update ON public.attendance_comments;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='attendance_comments' AND column_name='attendance_id') THEN
        EXECUTE 'UPDATE public.attendance_comments SET attendance_record_id = attendance_id WHERE attendance_record_id IS NULL';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='attendance_comments' AND column_name='tenant_id') THEN
        EXECUTE 'UPDATE public.attendance_comments SET organisation_id = tenant_id WHERE organisation_id IS NULL';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='attendance_comments' AND column_name='comment') THEN
        EXECUTE 'UPDATE public.attendance_comments SET body = comment WHERE body IS NULL';
    END IF;
END $$;

UPDATE public.attendance_comments c
   SET organisation_id = r.organisation_id
  FROM public.attendance_records r
 WHERE r.id = c.attendance_record_id AND c.organisation_id IS NULL;
ALTER TABLE public.attendance_comments
    ALTER COLUMN attendance_record_id SET NOT NULL,
    ALTER COLUMN organisation_id SET NOT NULL,
    ALTER COLUMN body SET NOT NULL;

DO $$
BEGIN
    IF to_regprocedure('public.fn_prevent_attendance_comment_mutation()') IS NOT NULL THEN
        CREATE TRIGGER trg_prevent_attendance_comment_update
            BEFORE UPDATE OR DELETE ON public.attendance_comments
            FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_attendance_comment_mutation();
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS attendance_comments_record ON public.attendance_comments(attendance_record_id, created_at);

CREATE TABLE IF NOT EXISTS public.app_record_audit (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organisation_id UUID NOT NULL,
    app_key TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL,
    actor_membership_id UUID,
    before_row JSONB,
    after_row JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.fn_app_record_allowed(
    p_app_key TEXT, p_action TEXT, p_organisation_id UUID, p_department TEXT,
    p_owner_membership_id UUID, p_assignee_membership_id UUID DEFAULT NULL,
    p_reviewer_membership_id UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_context_id UUID;
    v_actor UUID;
    v_org UUID;
    v_role TEXT;
    v_department TEXT;
    v_job_role TEXT;
    v_permission TEXT;
    v_allow BOOLEAN := FALSE;
BEGIN
    v_context_id := NULLIF(current_setting('archscale.current_context_id', true), '')::uuid;
    IF v_context_id IS NULL OR NOT public.is_context_valid(v_context_id) THEN RETURN FALSE; END IF;

    SELECT m.id, ac.organisation_id, m.role_key, m.department, m.job_role
      INTO v_actor, v_org, v_role, v_department, v_job_role
      FROM public.access_contexts ac
      JOIN public.memberships m ON m.id = ac.membership_id
     WHERE ac.id = v_context_id AND ac.revoked_at IS NULL AND m.status = 'ACTIVE';
    IF v_actor IS NULL OR v_org <> p_organisation_id THEN RETURN FALSE; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.organisation_entitlements e
                    WHERE e.organisation_id = v_org AND e.app_key = p_app_key AND e.is_enabled) THEN
        RETURN FALSE;
    END IF;
    v_permission := p_app_key || '.' || CASE p_action
        WHEN 'edit_details' THEN 'edit'
        WHEN 'edit_status' THEN 'edit'
        ELSE p_action
    END;
    IF NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_key = v_role AND rp.permission_key = v_permission) THEN
        RETURN FALSE;
    END IF;

    SELECT p.effect = 'ALLOW'
      INTO v_allow
      FROM public.app_authorization_policies p
     WHERE p.is_active
       AND p.app_key = p_app_key
       AND p.action_key = p_action
       AND (p.organisation_id IS NULL OR p.organisation_id = v_org)
       AND p.role_key = v_role
       AND (p.department IS NULL OR p.department = v_department)
       AND (p.job_role IS NULL OR p.job_role = v_job_role)
       AND CASE p.target_scope
           WHEN 'tenant' THEN TRUE
           WHEN 'reviewer' THEN p_reviewer_membership_id = v_actor
           WHEN 'assignee' THEN p_assignee_membership_id = v_actor
           WHEN 'direct_reports' THEN EXISTS (
               SELECT 1 FROM public.memberships target
                WHERE target.id = p_assignee_membership_id
                  AND target.organisation_id = v_org
                  AND target.reporting_manager_membership_id = v_actor
                  AND target.status = 'ACTIVE'
           )
           WHEN 'same_department' THEN p_department = v_department
           ELSE FALSE
       END
     ORDER BY p.priority ASC, (p.organisation_id IS NOT NULL) DESC
     LIMIT 1;
    RETURN COALESCE(v_allow, FALSE);
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_app_records_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org UUID; v_id UUID; v_app TEXT; v_actor UUID; v_action TEXT;
BEGIN
    IF TG_TABLE_NAME = 'tasks' THEN
        v_org := COALESCE(NEW.organisation_id, OLD.organisation_id); v_id := COALESCE(NEW.id, OLD.id); v_app := 'tasks';
    ELSE
        v_org := COALESCE(NEW.organisation_id, OLD.organisation_id); v_id := COALESCE(NEW.id, OLD.id); v_app := 'attendance';
    END IF;
    SELECT membership_id INTO v_actor FROM public.access_contexts
     WHERE id = NULLIF(current_setting('archscale.current_context_id', true), '')::uuid;
    v_action := lower(TG_OP);
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.app_record_audit(organisation_id,app_key,record_id,action,actor_membership_id,after_row)
        VALUES(v_org,v_app,v_id,v_action,v_actor,to_jsonb(NEW)); RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO public.app_record_audit(organisation_id,app_key,record_id,action,actor_membership_id,before_row,after_row)
        VALUES(v_org,v_app,v_id,v_action,v_actor,to_jsonb(OLD),to_jsonb(NEW)); RETURN NEW;
    ELSE
        INSERT INTO public.app_record_audit(organisation_id,app_key,record_id,action,actor_membership_id,before_row)
        VALUES(v_org,v_app,v_id,v_action,v_actor,to_jsonb(OLD)); RETURN OLD;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS tasks_audit_trigger ON public.tasks;
CREATE TRIGGER tasks_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.fn_app_records_audit();
DROP TRIGGER IF EXISTS attendance_audit_trigger ON public.attendance_records;
CREATE TRIGGER attendance_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.fn_app_records_audit();

CREATE OR REPLACE FUNCTION public.fn_app_prevent_task_identity_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.created_by_membership_id <> OLD.created_by_membership_id OR NEW.organisation_id <> OLD.organisation_id THEN
        RAISE EXCEPTION 'Task creator and tenant are immutable';
    END IF;
    IF NEW.assigned_to_membership_id <> OLD.assigned_to_membership_id THEN
        IF NOT public.fn_app_record_allowed('tasks','assign',OLD.organisation_id,OLD.department,OLD.created_by_membership_id,NEW.assigned_to_membership_id,OLD.reviewer_membership_id) THEN
            RAISE EXCEPTION 'Task reassignment is not permitted';
        END IF;
        INSERT INTO public.app_record_audit(organisation_id,app_key,record_id,action,actor_membership_id,before_row,after_row)
        VALUES(OLD.organisation_id,'tasks',OLD.id,'reassigned',
            (SELECT membership_id FROM public.access_contexts WHERE id = NULLIF(current_setting('archscale.current_context_id', true), '')::uuid),
            jsonb_build_object('assigned_to_membership_id',OLD.assigned_to_membership_id),
            jsonb_build_object('assigned_to_membership_id',NEW.assigned_to_membership_id));
    END IF;
    IF (NEW.title,NEW.description,NEW.department,NEW.reviewer_membership_id,NEW.start_date,NEW.due_at,NEW.priority)
       IS DISTINCT FROM
       (OLD.title,OLD.description,OLD.department,OLD.reviewer_membership_id,OLD.start_date,OLD.due_at,OLD.priority)
       AND NOT public.fn_app_record_allowed('tasks','edit_details',OLD.organisation_id,OLD.department,OLD.created_by_membership_id,OLD.assigned_to_membership_id,OLD.reviewer_membership_id) THEN
        RAISE EXCEPTION 'Task detail edit is not permitted';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND
       NOT public.fn_app_record_allowed('tasks','edit_status',OLD.organisation_id,OLD.department,OLD.created_by_membership_id,OLD.assigned_to_membership_id,OLD.reviewer_membership_id) THEN
        RAISE EXCEPTION 'Task status edit is not permitted';
    END IF;
    IF (NEW.approval_status,NEW.approved_by_membership_id) IS DISTINCT FROM (OLD.approval_status,OLD.approved_by_membership_id)
       AND NOT public.fn_app_record_allowed('tasks','approve',OLD.organisation_id,OLD.department,OLD.created_by_membership_id,OLD.assigned_to_membership_id,OLD.reviewer_membership_id) THEN
        RAISE EXCEPTION 'Task approval is not permitted';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS tasks_identity_guard ON public.tasks;
CREATE TRIGGER tasks_identity_guard BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.fn_app_prevent_task_identity_change();

CREATE OR REPLACE FUNCTION public.fn_app_bind_record_actor()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_context UUID; v_actor UUID; v_org UUID; v_workspace UUID;
BEGIN
    v_context := NULLIF(current_setting('archscale.current_context_id', true), '')::uuid;
    SELECT ac.membership_id, ac.organisation_id, ac.workspace_id
      INTO v_actor, v_org, v_workspace FROM public.access_contexts ac
     WHERE ac.id = v_context AND public.is_context_valid(ac.id);
    IF v_actor IS NULL THEN RAISE EXCEPTION 'A valid active context is required'; END IF;
    IF TG_TABLE_NAME = 'tasks' THEN
        IF TG_OP = 'INSERT' THEN
            NEW.created_by_membership_id := v_actor;
            NEW.organisation_id := v_org;
            NEW.workspace_id := v_workspace;
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
            NEW.organisation_id := v_org; NEW.workspace_id := v_workspace;
            NEW.created_by_membership_id := v_actor;
            NEW.last_updated_by_membership_id := v_actor;
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
DROP TRIGGER IF EXISTS tasks_bind_actor ON public.tasks;
CREATE TRIGGER tasks_bind_actor BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.fn_app_bind_record_actor();
DROP TRIGGER IF EXISTS attendance_bind_actor ON public.attendance_records;
CREATE TRIGGER attendance_bind_actor BEFORE INSERT OR UPDATE ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION public.fn_app_bind_record_actor();
DROP TRIGGER IF EXISTS attendance_comments_bind_actor ON public.attendance_comments;
CREATE TRIGGER attendance_comments_bind_actor BEFORE INSERT ON public.attendance_comments FOR EACH ROW EXECUTE FUNCTION public.fn_app_bind_record_actor();

-- Replace every legacy policy on the app tables so permissive policies from an
-- earlier schema cannot OR around the current context-bound authorization.
DO $$
DECLARE v_policy RECORD;
BEGIN
    FOR v_policy IN
        SELECT schemaname, tablename, policyname
          FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename IN ('tasks', 'attendance_records', 'attendance_comments')
    LOOP
        EXECUTE format('DROP POLICY %I ON %I.%I', v_policy.policyname, v_policy.schemaname, v_policy.tablename);
    END LOOP;
END $$;

REVOKE ALL ON public.tasks, public.attendance_records, public.attendance_comments FROM PUBLIC, anon, authenticated, archscale_app_runtime;

ALTER TABLE public.app_authorization_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_authorization_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_comments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.app_record_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_record_audit FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_policy_config_read ON public.app_authorization_policies;
CREATE POLICY app_policy_config_read ON public.app_authorization_policies FOR SELECT TO archscale_app_runtime USING (public.is_context_valid());
DROP POLICY IF EXISTS tasks_select_policy ON public.tasks;
CREATE POLICY tasks_select_policy ON public.tasks FOR SELECT TO archscale_app_runtime
USING (public.fn_app_record_allowed('tasks','read',organisation_id,department,created_by_membership_id,assigned_to_membership_id));
DROP POLICY IF EXISTS tasks_insert_policy ON public.tasks;
CREATE POLICY tasks_insert_policy ON public.tasks FOR INSERT TO archscale_app_runtime
WITH CHECK (public.fn_app_record_allowed('tasks','create',organisation_id,department,created_by_membership_id,assigned_to_membership_id));
DROP POLICY IF EXISTS tasks_update_policy ON public.tasks;
CREATE POLICY tasks_update_policy ON public.tasks FOR UPDATE TO archscale_app_runtime
USING (public.fn_app_record_allowed('tasks','edit',organisation_id,department,created_by_membership_id,assigned_to_membership_id))
WITH CHECK (public.fn_app_record_allowed('tasks','edit',organisation_id,department,created_by_membership_id,assigned_to_membership_id));
DROP POLICY IF EXISTS attendance_select_policy ON public.attendance_records;
CREATE POLICY attendance_select_policy ON public.attendance_records FOR SELECT TO archscale_app_runtime
USING (public.fn_app_record_allowed('attendance','read',organisation_id,department,membership_id,membership_id));
DROP POLICY IF EXISTS attendance_update_policy ON public.attendance_records;
CREATE POLICY attendance_update_policy ON public.attendance_records FOR UPDATE TO archscale_app_runtime
USING (public.fn_app_record_allowed('attendance','edit',organisation_id,department,membership_id,membership_id))
WITH CHECK (public.fn_app_record_allowed('attendance','edit',organisation_id,department,membership_id,membership_id));
DROP POLICY IF EXISTS attendance_comment_select_policy ON public.attendance_comments;
CREATE POLICY attendance_comment_select_policy ON public.attendance_comments FOR SELECT TO archscale_app_runtime
USING (public.fn_app_record_allowed('attendance','read',organisation_id,NULL,NULL,NULL));
DROP POLICY IF EXISTS attendance_comment_insert_policy ON public.attendance_comments;
CREATE POLICY attendance_comment_insert_policy ON public.attendance_comments FOR INSERT TO archscale_app_runtime
WITH CHECK (public.fn_app_record_allowed('attendance','comment',organisation_id,NULL,NULL,NULL)
    AND EXISTS (SELECT 1 FROM public.attendance_records r
                 WHERE r.id = attendance_comments.attendance_record_id
                   AND r.organisation_id = attendance_comments.organisation_id));

GRANT SELECT, INSERT, UPDATE ON public.tasks TO archscale_app_runtime;
GRANT SELECT, UPDATE ON public.attendance_records TO archscale_app_runtime;
GRANT SELECT, INSERT ON public.attendance_comments TO archscale_app_runtime;
GRANT SELECT ON public.app_authorization_policies TO archscale_app_runtime;
REVOKE ALL ON public.app_record_audit FROM PUBLIC, anon, authenticated, archscale_app_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON public.app_record_audit FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.app_record_audit_id_seq TO archscale_app_runtime;
GRANT EXECUTE ON FUNCTION public.fn_app_record_allowed(TEXT,TEXT,UUID,TEXT,UUID,UUID,UUID) TO archscale_app_runtime;

