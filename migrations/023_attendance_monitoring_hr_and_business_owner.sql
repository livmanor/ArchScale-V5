-- =============================================================================
-- Migration 023: Attendance Monitoring for HR and Business Owner
-- =============================================================================
-- Empowers both Human Resources (manager_coordinator in HR) and Business Owners
-- (business_owner) with full oversight to monitor, maintain, and review tenant-wide
-- employee and intern attendance records.
-- =============================================================================

-- 1. Ensure permissions exist in catalogue
INSERT INTO public.permissions (key, name, description, min_aal)
VALUES
    ('attendance.read', 'Read attendance', 'Read tenant attendance permitted by policy', 'aal1'),
    ('attendance.edit', 'Edit attendance', 'Edit attendance values', 'aal1'),
    ('attendance.comment', 'Comment on attendance', 'Append an HR/Manager comment', 'aal1'),
    ('attendance.records.read', 'Read attendance records', 'Read tenant attendance records', 'aal1'),
    ('attendance.records.write', 'Write attendance records', 'Write tenant attendance records', 'aal1')
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- 2. Grant attendance permissions to business_owner and manager_coordinator
INSERT INTO public.role_permissions (role_key, permission_key)
VALUES
    ('business_owner', 'attendance.read'),
    ('business_owner', 'attendance.edit'),
    ('business_owner', 'attendance.comment'),
    ('business_owner', 'attendance.records.read'),
    ('business_owner', 'attendance.records.write'),
    ('manager_coordinator', 'attendance.read'),
    ('manager_coordinator', 'attendance.edit'),
    ('manager_coordinator', 'attendance.comment'),
    ('manager_coordinator', 'attendance.records.read'),
    ('manager_coordinator', 'attendance.records.write'),
    ('intern', 'attendance.read'),
    ('intern', 'attendance.comment')
ON CONFLICT (role_key, permission_key) DO NOTHING;

-- 3. Configure App Authorization Policies for tenant-wide oversight
DELETE FROM public.app_authorization_policies WHERE app_key = 'attendance';

INSERT INTO public.app_authorization_policies(app_key, action_key, role_key, department, job_role, target_scope, effect, priority)
VALUES
    -- Business owner has top-level authority over tenant attendance
    ('attendance', 'read', 'business_owner', NULL, NULL, 'tenant', 'ALLOW', 10),
    ('attendance', 'edit', 'business_owner', NULL, NULL, 'tenant', 'ALLOW', 10),
    ('attendance', 'comment', 'business_owner', NULL, NULL, 'tenant', 'ALLOW', 10),
    -- HR Manager has full operational authority
    ('attendance', 'read', 'manager_coordinator', 'HR', 'HR Manager', 'tenant', 'ALLOW', 10),
    ('attendance', 'edit', 'manager_coordinator', 'HR', 'HR Manager', 'tenant', 'ALLOW', 10),
    ('attendance', 'comment', 'manager_coordinator', 'HR', 'HR Manager', 'tenant', 'ALLOW', 10),
    -- Junior HR can monitor and comment
    ('attendance', 'read', 'intern', 'HR', 'Junior HR', 'tenant', 'ALLOW', 20),
    ('attendance', 'comment', 'intern', 'HR', 'Junior HR', 'tenant', 'ALLOW', 20);

-- 4. Set job_roles for HR entries
UPDATE public.app_authorization_policies SET job_role = 'HR Manager'
 WHERE app_key = 'attendance' AND role_key = 'manager_coordinator' AND department = 'HR';
UPDATE public.app_authorization_policies SET job_role = 'Junior HR'
 WHERE app_key = 'attendance' AND role_key = 'intern' AND department = 'HR';

-- 5. Unified SELECT Policy: self-service access for employees OR policy-authorized tenant monitoring
DROP POLICY IF EXISTS attendance_select_policy ON public.attendance_records;
DROP POLICY IF EXISTS attendance_self_select_policy ON public.attendance_records;

CREATE POLICY attendance_select_policy ON public.attendance_records FOR SELECT TO archscale_app_runtime
USING (
    public.fn_attendance_self_access(organisation_id, workspace_id, membership_id, department)
    OR public.fn_app_record_allowed('attendance', 'read', organisation_id, department, membership_id, membership_id)
);

-- 6. Unified UPDATE Policy: self-checkout OR manager/HR record maintenance
DROP POLICY IF EXISTS attendance_update_policy ON public.attendance_records;
DROP POLICY IF EXISTS attendance_self_update_policy ON public.attendance_records;

CREATE POLICY attendance_update_policy ON public.attendance_records FOR UPDATE TO archscale_app_runtime
USING (
    public.fn_attendance_self_access(organisation_id, workspace_id, membership_id, department)
    OR public.fn_app_record_allowed('attendance', 'edit', organisation_id, department, membership_id, membership_id)
)
WITH CHECK (
    public.fn_attendance_self_access(organisation_id, workspace_id, membership_id, department)
    OR public.fn_app_record_allowed('attendance', 'edit', organisation_id, department, membership_id, membership_id)
);

-- 7. Unified Comments Policies
DROP POLICY IF EXISTS attendance_comment_select_policy ON public.attendance_comments;
CREATE POLICY attendance_comment_select_policy ON public.attendance_comments FOR SELECT TO archscale_app_runtime
USING (
    public.fn_app_record_allowed('attendance', 'read', organisation_id, NULL, NULL, NULL)
    OR EXISTS (
        SELECT 1 FROM public.attendance_records r
         WHERE r.id = attendance_comments.attendance_record_id
           AND public.fn_attendance_self_access(r.organisation_id, r.workspace_id, r.membership_id, r.department)
    )
);

DROP POLICY IF EXISTS attendance_comment_insert_policy ON public.attendance_comments;
CREATE POLICY attendance_comment_insert_policy ON public.attendance_comments FOR INSERT TO archscale_app_runtime
WITH CHECK (
    public.fn_app_record_allowed('attendance', 'comment', organisation_id, NULL, NULL, NULL)
    AND EXISTS (
        SELECT 1 FROM public.attendance_records r
         WHERE r.id = attendance_comments.attendance_record_id
           AND r.organisation_id = attendance_comments.organisation_id
    )
);

-- 8. Runtime Grants
GRANT SELECT, INSERT, UPDATE ON public.attendance_records TO archscale_app_runtime;
GRANT SELECT, INSERT ON public.attendance_comments TO archscale_app_runtime;
GRANT SELECT ON public.app_authorization_policies TO archscale_app_runtime;
