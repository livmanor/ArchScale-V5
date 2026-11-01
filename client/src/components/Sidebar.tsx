import React from 'react';

export interface NavItem {
  key: string;
  label: string;
  icon?: string;
  badge?: number | string;
  hidden?: boolean;
}

interface SidebarProps {
  items: NavItem[];
  active: string;
  onChange: (key: string) => void;
  title?: string;
  subtitle?: string;
  collapsed?: boolean;
  onCollapse?: () => void;
  userEmail?: string;
  userName?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  items, active, onChange, title, subtitle, collapsed, onCollapse, userEmail, userName
}) => {
  const displayTitle = title ?? 'ArchScale';
  const displayName = userName || (userEmail ? userEmail.split('@')[0] : 'User');
  const userInitial = displayName[0]?.toUpperCase() ?? 'A';

  return (
    <nav
      style={{
        width: collapsed ? 64 : 'var(--sidebar-width)',
        minWidth: collapsed ? 64 : 'var(--sidebar-width)',
        background: 'var(--color-sidebar-bg)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        flexShrink: 0,
        transition: 'width var(--transition), min-width var(--transition)',
        overflow: 'hidden',
        borderRight: '1px solid var(--color-sidebar-border)',
        userSelect: 'none',
      }}
    >
      {/* Brand / Header */}
      <div style={{
        padding: collapsed ? '16px 0' : '0 16px',
        height: 'var(--topbar-height)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
        gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden', minWidth: 0 }}>
          {/* Bernaire-style Warm Orange Logo Mark */}
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #fb923c, #f97316)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 800,
            flexShrink: 0,
            boxShadow: '0 2px 4px rgba(249, 115, 22, 0.25)',
          }}>
            AS
          </div>
          {!collapsed && (
            <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayTitle}
              </div>
              {subtitle && (
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {subtitle}
                </div>
              )}
            </div>
          )}
        </div>
        {onCollapse && !collapsed && (
          <button
            onClick={onCollapse}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              fontSize: 14,
              padding: 4,
              flexShrink: 0,
              lineHeight: 1,
              borderRadius: 4,
            }}
            aria-label="Collapse sidebar"
          >
            ‹
          </button>
        )}
      </div>

      {/* Search Input in Sidebar (like Bernaire) */}
      {!collapsed && (
        <div style={{ padding: '14px 14px 6px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#f9fafb',
            border: '1px solid #eaecf0',
            borderRadius: 'var(--radius)',
            padding: '7px 10px',
            fontSize: 12,
            color: '#667085',
          }}>
            <span style={{ fontSize: 12 }}>🔍</span>
            <input
              placeholder="Search anything..."
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 12,
                color: 'var(--color-text)',
                width: '100%',
              }}
            />
            <span style={{
              background: '#ffffff',
              border: '1px solid #e4e7ec',
              borderRadius: 4,
              padding: '1px 5px',
              fontSize: 10,
              fontWeight: 600,
              color: '#98a2b3',
            }}>
              ⌘K
            </span>
          </div>
        </div>
      )}

      {/* Section Header */}
      {!collapsed && (
        <div style={{
          padding: '12px 18px 4px',
          fontSize: 11,
          fontWeight: 600,
          color: '#98a2b3',
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
        }}>
          Menu
        </div>
      )}

      {/* Nav items */}
      <div style={{ flex: 1, padding: '4px 8px', overflowY: 'auto' }}>
        {items.filter(i => !i.hidden).map(item => {
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: collapsed ? '0 10px' : '0 12px',
                height: 38,
                borderRadius: 'var(--radius)',
                background: isActive ? 'var(--color-sidebar-active-bg)' : 'transparent',
                border: 'none',
                color: isActive ? 'var(--color-sidebar-active)' : 'var(--color-sidebar-text)',
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background var(--transition), color var(--transition)',
                justifyContent: collapsed ? 'center' : 'space-between',
                marginBottom: 2,
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-sidebar-hover)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text)';
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-sidebar-text)';
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, overflow: 'hidden' }}>
                {item.icon && (
                  <span style={{
                    flexShrink: 0,
                    fontSize: 15,
                    color: isActive ? 'var(--color-accent)' : 'var(--color-text-muted)',
                  }}>
                    {item.icon}
                  </span>
                )}
                {!collapsed && (
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.label}
                  </span>
                )}
              </div>
              {!collapsed && item.badge !== undefined && (
                <span style={{
                  background: 'var(--color-accent)',
                  color: '#ffffff',
                  borderRadius: 'var(--radius-pill)',
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '1px 7px',
                  lineHeight: '16px',
                }}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* User profile card at the bottom of sidebar */}
      {!collapsed ? (
        <div style={{
          padding: '12px 14px',
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: '#ffffff',
        }}>
          <div style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: '#ffedd5',
            color: '#c2410c',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
            border: '1px solid #fed7aa',
          }}>
            {userInitial}
          </div>
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName}
            </div>
            {userEmail && (
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {userEmail}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{
          padding: '14px 0',
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          justifyContent: 'center',
        }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: '#ffedd5',
            color: '#c2410c',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
          }}>
            {userInitial}
          </div>
        </div>
      )}
    </nav>
  );
};
