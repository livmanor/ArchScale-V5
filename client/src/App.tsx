import React, { useEffect, useState } from 'react';
import './styles/global.css';

import { setToken, setRefreshToken, setContextId, logout } from './api/client';
import { SessionContext, SessionData, ContextData } from './hooks/useSession';
import { useToast } from './hooks/useToast';
import { ToastList } from './components/Toast';
import { Sidebar, NavItem } from './components/Sidebar';
import { TopBar } from './components/TopBar';

import { LoginPage } from './pages/auth/LoginPage';
import { OrgWorkspacePicker } from './pages/auth/OrgWorkspacePicker';
import { TeamPage } from './pages/frontstage/TeamPage';
import { TasksPage } from './pages/frontstage/TasksPage';
import { AttendancePage } from './pages/frontstage/AttendancePage';
import { InvitationsPage } from './pages/frontstage/InvitationsPage';
import { RolesPermissionsPage } from './pages/frontstage/RolesPermissionsPage';
import { TenantsPage } from './pages/backstage/TenantsPage';
import { AuditLogPage } from './pages/backstage/AuditLogPage';
import { SupportAccessPage } from './pages/backstage/SupportAccessPage';

export const App: React.FC = () => {
  const { toasts, removeToast } = useToast();
  const [session, setSession] = useState<SessionData | null>(null);
  const [context, setContext] = useState<ContextData | null>(null);
  const [activeNav, setActiveNav] = useState('tasks');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pickingContext, setPickingContext] = useState(false);

  useEffect(() => {
    const handleUnauthorized = () => {
      setSession(null); setContext(null); setPickingContext(false);
      setToken(null); setRefreshToken(null); setContextId(null); setActiveNav('tasks');
    };
    window.addEventListener('xauth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('xauth:unauthorized', handleUnauthorized);
  }, []);

  const personaRole = context?.roleKey;
  const personaDept = context?.department ?? '';
  const isBackstage = context?.portal === 'platform';
  const isTenantAdmin = personaRole === 'business_owner' || personaRole === 'tenant_admin';
  const isHR = personaDept === 'HR';
  const isManager = personaRole === 'leader' || personaRole === 'manager_coordinator';

  // Section 11: Attendance is strictly hidden from Tenant Admin, Design, Accounts
  const showAttendance = isBackstage || isHR;
  // Section 06: Invitations can only be managed by Tenant Admin
  const showInvitations = isTenantAdmin;
  // Section 13: Roles & Permissions preview visible to Tenant Admin and Managers
  const showRoles = isTenantAdmin || isManager || isBackstage;

  const backstageNav: NavItem[] = [
    { key: 'tenants', label: 'Tenants', icon: '🏢' },
    { key: 'roles',   label: 'RBAC Matrix', icon: '🛡' },
    { key: 'audit',   label: 'Audit Log', icon: '🔍' },
    { key: 'support', label: 'Support', icon: '🔧' },
  ];

  const frontstageNav: NavItem[] = [
    { key: 'tasks',       label: 'Tasks',              icon: '✓' },
    { key: 'team',        label: 'Team & Members',     icon: '👥' },
    { key: 'attendance',  label: 'Attendance',         icon: '📅', hidden: !showAttendance },
    { key: 'invitations', label: 'Invitations',        icon: '✉', hidden: !showInvitations },
    { key: 'roles',       label: 'Roles & Permissions',icon: '🛡', hidden: !showRoles },
  ];

  const navItems = isBackstage ? backstageNav : frontstageNav;

  const handleLoginSuccess = (sess: SessionData) => {
    setSession(sess);
    setToken(sess.accessToken);
    setRefreshToken(sess.refreshToken ?? null);
    setPickingContext(true);
    setActiveNav('tasks');
  };

  const handleContextCreated = (ctx: ContextData) => {
    setContext(ctx);
    setContextId(ctx.contextId);
    setPickingContext(false);
    setActiveNav(ctx.portal === 'platform' ? 'tenants' : 'tasks');
  };

  const handleLogout = async () => {
    try { await logout(context?.contextId); } catch { /* ignore network */ }
    setSession(null);
    setContext(null);
    setPickingContext(false);
    setActiveNav('tasks');
    setToken(null);
    setRefreshToken(null);
    setContextId(null);
  };

  const renderPage = () => {
    if (isBackstage) {
      switch (activeNav) {
        case 'tenants': return <TenantsPage />;
        case 'roles':   return <RolesPermissionsPage />;
        case 'audit':   return <AuditLogPage />;
        case 'support': return <SupportAccessPage onContextCreated={handleContextCreated} />;
        default:        return <TenantsPage />;
      }
    }
    switch (activeNav) {
      case 'tasks':       return <TasksPage />;
      case 'team':        return <TeamPage />;
      case 'attendance':  return <AttendancePage />;
      case 'invitations': return <InvitationsPage />;
      case 'roles':       return <RolesPermissionsPage />;
      default:            return <TasksPage />;
    }
  };

  // ── Not logged in ──────────────────────────────────────────────────────────
  if (!session) {
    return (
      <SessionContext.Provider value={{ session, context, setSession, setContext }}>
        <ToastList toasts={toasts} onRemove={removeToast} />
        <LoginPage onSuccess={handleLoginSuccess} />
      </SessionContext.Provider>
    );
  }

  // ── Org/workspace picker ───────────────────────────────────────────────────
  if (pickingContext) {
    return (
      <SessionContext.Provider value={{ session, context, setSession, setContext }}>
        <ToastList toasts={toasts} onRemove={removeToast} />
        <OrgWorkspacePicker onContextCreated={handleContextCreated} onLogout={handleLogout} />
      </SessionContext.Provider>
    );
  }

  // ── Main shell ─────────────────────────────────────────────────────────────
  return (
    <SessionContext.Provider value={{ session, context, setSession, setContext }}>
      <ToastList toasts={toasts} onRemove={removeToast} />
      <div className="app-shell">
        <Sidebar
          items={navItems}
          active={activeNav}
          onChange={key => {
            if (key === 'attendance' && !showAttendance) return;
            if (key === 'invitations' && !showInvitations) return;
            if (key === 'roles' && !showRoles) return;
            setActiveNav(key);
          }}
          title={isBackstage ? 'ArchScale Platform' : (context?.organisationName ?? 'ArchScale')}
          subtitle={isBackstage ? 'Backstage' : (context?.jobRole ?? personaDept)}
          collapsed={sidebarCollapsed}
          onCollapse={() => setSidebarCollapsed(c => !c)}
        />
        <div className="app-content">
          <TopBar
            session={session}
            context={context}
            onLogout={handleLogout}
            onSwitchContext={() => setPickingContext(true)}
          />
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {renderPage()}
          </div>
        </div>
      </div>
    </SessionContext.Provider>
  );
};

