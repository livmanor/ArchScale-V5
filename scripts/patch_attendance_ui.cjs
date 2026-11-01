const fs = require('fs');

let code = fs.readFileSync('client/src/pages/frontstage/AttendancePage.tsx', 'utf8');

// Replace RBAC checks
code = code.replace(
  /const activeRole = context\?\.roleKey;[\s\S]*?const canComment = isHRManager \|\| isJuniorHR;/m,
  `const activeRole = context?.roleKey;
  const activeDept = context?.department;
  const isSupportReadOnly = !!context?.supportGrantId;
  const isHRManager = activeDept === 'HR' && activeRole === 'manager_coordinator';
  const isJuniorHR = activeDept === 'HR' && activeRole === 'intern';
  const isBusinessOwner = activeRole === 'business_owner';
  const canManageAttendance = isHRManager || isBusinessOwner;
  const canMonitorTenant = isHRManager || isJuniorHR || isBusinessOwner || isSupportReadOnly;
  const isSelfService = !!context?.membershipId && context.portal === 'subscriber' && !isSupportReadOnly;
  const isAuthorized = canMonitorTenant || isSelfService;
  const canComment = isHRManager || isJuniorHR || isBusinessOwner;`
);

// Replace handleSave check
code = code.replace(
  'if (!selected || !isHRManager) return;',
  'if (!selected || !canManageAttendance) return;'
);

// Replace PageHeader title & subtitle
code = code.replace(
  /title=\{isSelfService && !isHRManager && !isJuniorHR && !isSupportReadOnly \? 'My Attendance' : 'Attendance Application'\}[\s\S]*?subtitle=\{isHRManager[\s\S]*?: 'Audited support access — read only'\}/m,
  `title={!canMonitorTenant && isSelfService ? 'My Attendance' : 'Attendance Application'}
        subtitle={isHRManager
          ? 'HR Manager View — Tenant-wide workforce attendance monitoring, editing, and comment privileges'
          : isBusinessOwner
            ? 'Business Owner View — Tenant workforce attendance oversight, status management, and review'
            : isJuniorHR
              ? 'Junior HR View — Tenant-wide read and review privileges'
              : isSelfService
                ? 'Record your own attendance. HR and Management review tenant records.'
                : 'Audited support access — read only'}`
);

// Add Business Owner banner before DataTable
code = code.replace(
  '{isHRManager && (',
  `{isBusinessOwner && (
        <div style={{ padding: '10px 14px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', marginBottom: 'var(--sp-4)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
          👑 <strong>Business Owner Authority:</strong> You have full oversight to monitor, adjust statuses, correct work hours, and add notes for all employees and interns across your organization.
        </div>
      )}

      {isHRManager && (`
);

// Update Drawer onSave, badge and disabled fields
code = code.replace(
  'onSave={isHRManager ? handleSave : undefined}',
  'onSave={canManageAttendance ? handleSave : undefined}'
);
code = code.replace(
  "Badge variant={isHRManager ? 'success' : 'warning'}>{isHRManager ? 'Can Edit' : 'Read Only'}",
  "Badge variant={canManageAttendance ? 'success' : 'warning'}>{canManageAttendance ? 'Can Edit' : 'Read Only'}"
);
code = code.replaceAll('disabled={!isHRManager}', 'disabled={!canManageAttendance}');
code = code.replaceAll('hint={!isHRManager ?', 'hint={!canManageAttendance ?');

fs.writeFileSync('client/src/pages/frontstage/AttendancePage.tsx', code, 'utf8');
console.log('AttendancePage.tsx updated successfully');
