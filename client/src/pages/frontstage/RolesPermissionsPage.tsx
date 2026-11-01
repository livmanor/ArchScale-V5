import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  getMyPermissions,
  getRbacMatrix,
  grantRolePermission,
  revokeRolePermission,
  RbacRole,
  RbacPermission,
} from '../../api/client';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Alert } from '../../components/Alert';
import { Spinner } from '../../components/Spinner';
import { PageHeader } from '../../components/PageHeader';
import { useSession } from '../../hooks/useSession';
import { useToast } from '../../hooks/useToast';

interface PermissionRow {
  permission: string;
}

export const RolesPermissionsPage: React.FC = () => {
  const { context } = useSession();
  const { addToast } = useToast();
  const isPlatformAdmin = context?.portal === 'platform';

  // State for Platform RBAC Matrix
  const [roles, setRoles] = useState<RbacRole[]>([]);
  const [permissions, setPermissions] = useState<RbacPermission[]>([]);
  const [grants, setGrants] = useState<Record<string, string[]>>({});
  const [activePortalFilter, setActivePortalFilter] = useState<'all' | 'platform' | 'subscriber'>('all');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  // State for Member effective permissions view (Frontstage / Subscriber mode)
  const [myPermissions, setMyPermissions] = useState<PermissionRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (isPlatformAdmin) {
      const result = await getRbacMatrix();
      setLoading(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setRoles(result.data?.roles ?? []);
      setPermissions(result.data?.permissions ?? []);
      setGrants(result.data?.grants ?? {});
    } else {
      const result = await getMyPermissions();
      setLoading(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMyPermissions((result.data.permissions ?? []).map(permission => ({ permission })));
    }
  }, [isPlatformAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered roles based on portal tab
  const displayedRoles = useMemo(() => {
    if (activePortalFilter === 'all') return roles;
    return roles.filter(r => r.portal === activePortalFilter);
  }, [roles, activePortalFilter]);

  // Filtered permissions based on category & search query
  const displayedPermissions = useMemo(() => {
    let list = permissions;

    if (activeCategory !== 'all') {
      if (activeCategory === 'platform') {
        list = list.filter(p => p.key.startsWith('platform.'));
      } else if (activeCategory === 'org') {
        list = list.filter(p => p.key.startsWith('org.'));
      } else if (activeCategory === 'tasks') {
        list = list.filter(p => p.key.startsWith('tasks.') || p.key.includes('task'));
      } else if (activeCategory === 'attendance') {
        list = list.filter(p => p.key.startsWith('attendance.') || p.key.includes('attendance'));
      } else if (activeCategory === 'records') {
        list = list.filter(p => p.key.startsWith('project.'));
      }
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        p =>
          p.key.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q))
      );
    }

    return list;
  }, [permissions, activeCategory, search]);

  // Toggle permission handler for Founder
  const handleToggle = async (roleKey: string, permKey: string) => {
    // Prevent modifying founder's core self-preservation permissions
    if (
      roleKey === 'founder' &&
      ['platform.roles.manage', 'platform.organisations.manage', 'platform.organisations.approve'].includes(permKey)
    ) {
      addToast({ kind: 'warning', message: 'Root governance permission cannot be removed from Founder.' });
      return;
    }

    const currentRoleGrants = grants[roleKey] ?? [];
    const isCurrentlyGranted = currentRoleGrants.includes(permKey);
    const cellId = `${roleKey}:${permKey}`;
    setPendingKey(cellId);

    // Optimistic UI update
    setGrants(prev => ({
      ...prev,
      [roleKey]: isCurrentlyGranted
        ? (prev[roleKey] ?? []).filter(k => k !== permKey)
        : [...(prev[roleKey] ?? []), permKey],
    }));

    if (isCurrentlyGranted) {
      const res = await revokeRolePermission(roleKey, permKey);
      setPendingKey(null);
      if (!res.ok) {
        // Rollback
        setGrants(prev => ({
          ...prev,
          [roleKey]: [...(prev[roleKey] ?? []), permKey],
        }));
        addToast({ kind: 'error', message: res.message || 'Failed to revoke permission' });
      } else {
        addToast({ kind: 'success', message: `Revoked "${permKey}" from ${roleKey}` });
      }
    } else {
      const res = await grantRolePermission(roleKey, permKey);
      setPendingKey(null);
      if (!res.ok) {
        // Rollback
        setGrants(prev => ({
          ...prev,
          [roleKey]: (prev[roleKey] ?? []).filter(k => k !== permKey),
        }));
        addToast({ kind: 'error', message: res.message || 'Failed to grant permission' });
      } else {
        addToast({ kind: 'success', message: `Granted "${permKey}" to ${roleKey}` });
      }
    }
  };

  // ── NON-PLATFORM / SUBSCRIBER VIEW (Standard Member View) ──────────────────
  if (!isPlatformAdmin) {
    return (
      <div className="page-body">
        <PageHeader
          title="Effective Permissions"
          subtitle={`${context?.roleKey ?? 'Current membership'} · ${context?.organisationName ?? 'Selected organisation'}`}
        />
        {error && <Alert kind="error">{error}</Alert>}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-muted)' }}>
            <Spinner /> Loading permissions…
          </div>
        ) : (
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-xs)',
            overflow: 'hidden',
          }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr style={{ background: '#fafbfc', borderBottom: '1px solid var(--color-border)', height: 44 }}>
                  <th style={{ padding: '0 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#475467' }}>
                    Granted Permission
                  </th>
                </tr>
              </thead>
              <tbody>
                {myPermissions.length === 0 ? (
                  <tr>
                    <td style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                      No granted permissions found for this role.
                    </td>
                  </tr>
                ) : (
                  myPermissions.map(row => (
                    <tr key={row.permission} style={{ borderBottom: '1px solid var(--color-border-subtle)', height: 44 }}>
                      <td style={{ padding: '0 16px' }}>
                        <Badge variant="info">{row.permission}</Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ── PLATFORM BACKSTAGE VIEW (FOUNDER RBAC PERMISSIONS CONSOLE) ──────────────
  return (
    <div className="page-body" style={{ maxWidth: 1440 }}>
      <PageHeader
        title="RBAC Permissions Matrix"
        subtitle="Foundational access governance. Configure exactly which roles can view, edit, approve, and modify permissions across the platform."
      />

      {error && <Alert kind="error">{error}</Alert>}

      {/* Top Filter and Search Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 14,
        marginBottom: 20,
      }}>
        {/* Role Portal Filter Pills */}
        <div style={{
          display: 'flex',
          background: '#f2f4f7',
          padding: 3,
          borderRadius: 8,
          gap: 2,
        }}>
          {(['all', 'platform', 'subscriber'] as const).map(portal => {
            const isActive = activePortalFilter === portal;
            const label = portal === 'all' ? 'All Roles' : portal === 'platform' ? 'Platform Roles' : 'Tenant Roles';
            return (
              <button
                key={portal}
                onClick={() => setActivePortalFilter(portal)}
                style={{
                  border: 'none',
                  background: isActive ? '#ffffff' : 'transparent',
                  color: isActive ? '#101828' : '#475467',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: 13,
                  padding: '6px 14px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  boxShadow: isActive ? '0 1px 2px rgba(16, 24, 40, 0.06)' : 'none',
                  transition: 'all var(--transition)',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Category Pills & Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Categories */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'All Categories' },
              { id: 'platform', label: 'Platform' },
              { id: 'org', label: 'Organisation' },
              { id: 'tasks', label: 'Tasks' },
              { id: 'attendance', label: 'Attendance' },
              { id: 'records', label: 'Projects' },
            ].map(cat => {
              const isSelected = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  style={{
                    border: `1px solid ${isSelected ? 'var(--color-accent)' : '#d0d5dd'}`,
                    background: isSelected ? 'var(--color-accent-light)' : '#ffffff',
                    color: isSelected ? 'var(--color-accent-text)' : '#344054',
                    fontWeight: isSelected ? 600 : 500,
                    fontSize: 12,
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-pill)',
                    cursor: 'pointer',
                    transition: 'all var(--transition)',
                  }}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', width: 220 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#98a2b3', fontSize: 12 }}>🔍</span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter permissions…"
              style={{
                width: '100%',
                height: 34,
                padding: '0 10px 0 30px',
                border: '1px solid #d0d5dd',
                borderRadius: 'var(--radius)',
                fontSize: 12,
                background: '#ffffff',
                color: '#101828',
                outline: 'none',
                boxShadow: 'var(--shadow-xs)',
              }}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-muted)' }}>
          <Spinner size={24} />
          <p style={{ marginTop: 12, fontSize: 14 }}>Loading RBAC permissions matrix…</p>
        </div>
      ) : (
        /* Matrix Container */
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-xs)',
          overflow: 'hidden',
        }}>
          <div style={{ overflowX: 'auto', maxHeight: '72vh' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr style={{ background: '#fafbfc', position: 'sticky', top: 0, zIndex: 10 }}>
                  {/* Permission Column Header */}
                  <th style={{
                    padding: '12px 18px',
                    textAlign: 'left',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#475467',
                    borderBottom: '1px solid var(--color-border)',
                    borderRight: '1px solid var(--color-border)',
                    minWidth: 320,
                    width: 320,
                    background: '#fafbfc',
                    position: 'sticky',
                    left: 0,
                    zIndex: 11,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Permission ({displayedPermissions.length})</span>
                      <span style={{ fontSize: 11, color: '#98a2b3', fontWeight: 400 }}>Min AAL</span>
                    </div>
                  </th>

                  {/* Role Columns Headers */}
                  {displayedRoles.map(role => {
                    const isFounderRole = role.key === 'founder';
                    const isPlatformPortal = role.portal === 'platform';
                    const roleGrantsCount = (grants[role.key] ?? []).length;

                    return (
                      <th
                        key={role.key}
                        style={{
                          padding: '12px 14px',
                          textAlign: 'center',
                          borderBottom: '1px solid var(--color-border)',
                          borderRight: '1px solid var(--color-border-subtle)',
                          minWidth: 120,
                          background: isFounderRole ? '#fffbf5' : '#fafbfc',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <span style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: isFounderRole ? '#c2410c' : '#101828',
                            whiteSpace: 'nowrap',
                          }}>
                            {role.name}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{
                              fontSize: 10,
                              fontWeight: 600,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: isPlatformPortal ? '#ffedd5' : '#e0f2fe',
                              color: isPlatformPortal ? '#c2410c' : '#0369a1',
                            }}>
                              L{role.level}
                            </span>
                            <span style={{ fontSize: 11, color: '#98a2b3' }}>
                              ({roleGrantsCount})
                            </span>
                          </div>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {displayedPermissions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={displayedRoles.length + 1}
                      style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--color-text-muted)' }}
                    >
                      No permissions match the selected filter or search query.
                    </td>
                  </tr>
                ) : (
                  displayedPermissions.map(perm => (
                    <tr
                      key={perm.key}
                      style={{
                        borderBottom: '1px solid var(--color-border-subtle)',
                        transition: 'background var(--transition)',
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLTableRowElement).style.background = '#fafbfc';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLTableRowElement).style.background = '#ffffff';
                      }}
                    >
                      {/* Left Header Cell: Permission Details */}
                      <td style={{
                        padding: '10px 18px',
                        borderBottom: '1px solid var(--color-border-subtle)',
                        borderRight: '1px solid var(--color-border)',
                        background: '#ffffff',
                        position: 'sticky',
                        left: 0,
                        zIndex: 2,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#101828' }}>
                              {perm.name}
                            </div>
                            <div style={{
                              fontFamily: 'monospace',
                              fontSize: 11,
                              color: 'var(--color-accent-text)',
                              marginTop: 2,
                            }}>
                              {perm.key}
                            </div>
                            {perm.description && (
                              <div style={{ fontSize: 11, color: '#667085', marginTop: 3, lineHeight: 1.3 }}>
                                {perm.description}
                              </div>
                            )}
                          </div>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: perm.min_aal === 'aal2' ? '#fef3f2' : '#f2f4f7',
                            color: perm.min_aal === 'aal2' ? '#b42318' : '#475467',
                            border: `1px solid ${perm.min_aal === 'aal2' ? '#fecdca' : '#eaecf0'}`,
                            flexShrink: 0,
                          }}>
                            {perm.min_aal.toUpperCase()}
                          </span>
                        </div>
                      </td>

                      {/* Role Checkbox / Toggle Cells */}
                      {displayedRoles.map(role => {
                        const isGranted = (grants[role.key] ?? []).includes(perm.key);
                        const isProtectedFounder =
                          role.key === 'founder' &&
                          ['platform.roles.manage', 'platform.organisations.manage', 'platform.organisations.approve'].includes(perm.key);
                        const cellId = `${role.key}:${perm.key}`;
                        const isPending = pendingKey === cellId;

                        return (
                          <td
                            key={role.key}
                            onClick={() => !isProtectedFounder && !isPending && handleToggle(role.key, perm.key)}
                            style={{
                              padding: '8px 10px',
                              textAlign: 'center',
                              borderBottom: '1px solid var(--color-border-subtle)',
                              borderRight: '1px solid var(--color-border-subtle)',
                              cursor: isProtectedFounder ? 'not-allowed' : 'pointer',
                              background: isProtectedFounder
                                ? '#fffbf5'
                                : isGranted
                                ? 'rgba(254, 243, 199, 0.15)'
                                : 'transparent',
                              transition: 'background var(--transition)',
                            }}
                            title={
                              isProtectedFounder
                                ? 'Root platform governance permission cannot be modified.'
                                : `${isGranted ? 'Click to revoke' : 'Click to grant'} ${perm.key} for ${role.name}`
                            }
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {isPending ? (
                                <Spinner size={14} />
                              ) : isProtectedFounder ? (
                                <div style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  background: '#ffedd5',
                                  color: '#c2410c',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: '3px 8px',
                                  borderRadius: 'var(--radius-pill)',
                                }}>
                                  <span>🔒</span> Root
                                </div>
                              ) : isGranted ? (
                                <div style={{
                                  width: 26,
                                  height: 26,
                                  borderRadius: 6,
                                  background: 'var(--color-accent)',
                                  color: '#ffffff',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 13,
                                  fontWeight: 700,
                                  boxShadow: '0 1px 2px rgba(249, 115, 22, 0.3)',
                                  transition: 'transform var(--transition)',
                                }}>
                                  ✓
                                </div>
                              ) : (
                                <div style={{
                                  width: 24,
                                  height: 24,
                                  borderRadius: 6,
                                  border: '1.5px solid #d0d5dd',
                                  background: '#ffffff',
                                  transition: 'border-color var(--transition)',
                                }} />
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Matrix Footer Note */}
          <div style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--color-border)',
            background: '#fafbfc',
            fontSize: 12,
            color: 'var(--color-text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span>
              💡 Click any checkbox to instantly grant or revoke that permission for that role. Changes apply in real time.
            </span>
            <span style={{ fontWeight: 500 }}>
              Showing {displayedPermissions.length} permissions across {displayedRoles.length} roles
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
