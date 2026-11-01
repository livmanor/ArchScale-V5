import React from 'react';

export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const COLORS: Record<BadgeVariant, React.CSSProperties> = {
  success: {
    background: 'var(--color-success-bg)',
    color: 'var(--color-success)',
    border: '1px solid var(--color-success-border)',
  },
  warning: {
    background: 'var(--color-warning-bg)',
    color: 'var(--color-warning)',
    border: '1px solid var(--color-warning-border)',
  },
  error: {
    background: 'var(--color-error-bg)',
    color: 'var(--color-error)',
    border: '1px solid var(--color-error-border)',
  },
  info: {
    background: 'var(--color-info-bg)',
    color: 'var(--color-info)',
    border: '1px solid var(--color-info-border)',
  },
  neutral: {
    background: 'var(--color-surface-2)',
    color: 'var(--color-text-muted)',
    border: '1px solid var(--color-border)',
  },
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ variant = 'neutral', size = 'md', children }) => (
  <span style={{
    ...COLORS[variant],
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: size === 'sm' ? '1px 8px' : '2px 10px',
    borderRadius: 'var(--radius-pill)',
    fontSize: size === 'sm' ? 11 : 12,
    fontWeight: 500,
    lineHeight: '18px',
    whiteSpace: 'nowrap',
    letterSpacing: '0.1px',
  }}>
    <span style={{
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: 'currentColor',
      opacity: 0.8,
      flexShrink: 0,
    }} />
    {children}
  </span>
);

/** Map a status string to a badge variant matching the Bernaire aesthetic */
export function statusVariant(status: string): BadgeVariant {
  const s = (status ?? '').toLowerCase();
  if (['active', 'approved', 'present', 'completed', 'complete', 'sent', 'success'].includes(s)) return 'success';
  if (['ongoing', 'pending', 'in review', 'leave', 'half day', 'work from home', 'in progress'].includes(s)) return 'warning';
  if (['suspended', 'rejected', 'expired', 'revoked', 'absent', 'error'].includes(s)) return 'error';
  if (['info', 'aal2', 'platform', 'super_admin'].includes(s)) return 'info';
  return 'neutral';
}
