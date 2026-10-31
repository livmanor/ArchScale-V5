-- Application catalog, permissions, and configurable tenant policies.
-- This seed runs after role and permission catalogue seeds because policy rows
-- reference the role keys created by seed 001.

INSERT INTO public.app_catalogue (app_key, name, description, is_active)
VALUES
    ('tasks', 'Tasks', 'Tenant task management', true),
    ('attendance', 'Attendance', 'Restricted HR attendance', true)
ON CONFLICT (app_key) DO UPDATE SET is_active = EXCLUDED.is_active;

INSERT INTO public.permissions (key, name, description, min_aal)
VALUES
    ('tasks.read', 'Read tasks', 'Read tasks permitted by the configured task policy', 'aal1'),
    ('tasks.create', 'Create tasks', 'Create tasks in the active tenant', 'aal1'),
    ('tasks.edit', 'Edit tasks', 'Edit task fields permitted by policy', 'aal1'),
    ('tasks.assign', 'Assign tasks', 'Assign tasks to tenant members', 'aal1'),
    ('tasks.approve', 'Approve tasks', 'Approve or reject task work', 'aal1'),
    ('attendance.read', 'Read attendance', 'Read tenant attendance permitted by policy', 'aal1'),
    ('attendance.edit', 'Edit attendance', 'Edit attendance values', 'aal1'),
    ('attendance.comment', 'Comment on attendance', 'Append an HR comment', 'aal1')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_authorization_policies(app_key,action_key,role_key,department,target_scope,effect,priority)
VALUES
    ('tasks','read','business_owner',NULL,'tenant','ALLOW',10),
    ('tasks','create','business_owner',NULL,'tenant','ALLOW',10),
    ('tasks','edit','business_owner',NULL,'tenant','ALLOW',10),
    ('tasks','assign','business_owner',NULL,'tenant','ALLOW',10),
    ('tasks','approve','business_owner',NULL,'tenant','ALLOW',10),
    ('tasks','edit_details','business_owner',NULL,'tenant','ALLOW',10),
    ('tasks','edit_status','business_owner',NULL,'tenant','ALLOW',10),
    ('tasks','read','leader','Design','same_department','ALLOW',20),
    ('tasks','create','leader','Design','same_department','ALLOW',20),
    ('tasks','edit','leader','Design','direct_reports','ALLOW',20),
    ('tasks','edit','leader','Design','assignee','ALLOW',20),
    ('tasks','assign','leader','Design','direct_reports','ALLOW',20),
    ('tasks','assign','leader','Design','assignee','ALLOW',20),
    ('tasks','approve','leader','Design','reviewer','ALLOW',20),
    ('tasks','edit_details','leader','Design','direct_reports','ALLOW',20),
    ('tasks','edit_details','leader','Design','assignee','ALLOW',20),
    ('tasks','edit_status','leader','Design','direct_reports','ALLOW',20),
    ('tasks','edit_status','leader','Design','assignee','ALLOW',20),
    ('tasks','read','manager_coordinator',NULL,'direct_reports','ALLOW',20),
    ('tasks','read','manager_coordinator',NULL,'same_department','ALLOW',30),
    ('tasks','edit','manager_coordinator',NULL,'direct_reports','ALLOW',20),
    ('tasks','edit','manager_coordinator',NULL,'assignee','ALLOW',20),
    ('tasks','create','manager_coordinator',NULL,'same_department','ALLOW',20),
    ('tasks','edit_details','manager_coordinator',NULL,'direct_reports','ALLOW',20),
    ('tasks','edit_details','manager_coordinator',NULL,'assignee','ALLOW',20),
    ('tasks','edit_status','manager_coordinator',NULL,'direct_reports','ALLOW',20),
    ('tasks','edit_status','manager_coordinator',NULL,'assignee','ALLOW',20),
    ('tasks','assign','manager_coordinator',NULL,'direct_reports','ALLOW',20),
    ('tasks','approve','manager_coordinator',NULL,'reviewer','ALLOW',20),
    ('tasks','read','intern',NULL,'assignee','ALLOW',20),
    ('tasks','edit','intern',NULL,'assignee','ALLOW',20),
    ('attendance','read','manager_coordinator','HR','tenant','ALLOW',20),
    ('attendance','edit','manager_coordinator','HR','tenant','ALLOW',20),
    ('attendance','comment','manager_coordinator','HR','tenant','ALLOW',20),
    ('attendance','read','intern','HR','tenant','ALLOW',20),
    ('attendance','comment','intern','HR','tenant','ALLOW',20)
ON CONFLICT DO NOTHING;

UPDATE public.app_authorization_policies SET job_role = 'HR Manager'
 WHERE app_key = 'attendance' AND role_key = 'manager_coordinator';
UPDATE public.app_authorization_policies SET job_role = 'Junior HR'
 WHERE app_key = 'attendance' AND role_key = 'intern';

INSERT INTO public.role_permissions(role_key,permission_key)
VALUES
    ('business_owner','tasks.read'),('business_owner','tasks.create'),('business_owner','tasks.edit'),('business_owner','tasks.assign'),('business_owner','tasks.approve'),
    ('leader','tasks.read'),('leader','tasks.create'),('leader','tasks.edit'),('leader','tasks.assign'),('leader','tasks.approve'),
    ('manager_coordinator','tasks.read'),('manager_coordinator','tasks.create'),('manager_coordinator','tasks.edit'),('manager_coordinator','tasks.assign'),('manager_coordinator','tasks.approve'),
    ('intern','tasks.read'),('intern','tasks.edit'),
    ('manager_coordinator','attendance.read'),('manager_coordinator','attendance.edit'),
    ('intern','attendance.read'),('intern','attendance.comment'),
    ('manager_coordinator','org.members.read')
ON CONFLICT DO NOTHING;
