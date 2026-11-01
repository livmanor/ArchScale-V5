import React from 'react';

type AlertKind = 'error' | 'warning' | 'info' | 'success';

const STYLES: Record<AlertKind, React.CSSProperties> = {
  error: {
    background: 'var(--color-error-bg)',
    color: 'var(--color-error)',
    border: '1px solid var(--color-error-border)',
  },
  warning: {
    background: 'var(--color-warning-bg)',
    color: 'var(--color-warning)',
    border: '1px solid var(--color-warning-border)',
  },
  info: {
    background: 'var(--color-info-bg)',
    color: 'var(--color-info)',
    border: '1px solid var(--color-info-border)',
  },
  success: {
    background: 'var(--color-success-bg)',
    color: 'var(--color-success)',
    border: '1px solid var(--color-success-border)',
  },
};

interface AlertProps {
  kind?: AlertKind;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export const Alert: React.FC<AlertProps> = ({ kind = 'error', children, style }) => (
  <div
    role="alert"
    style={{
      ...STYLES[kind],
      borderRadius: 'var(--radius)',
      padding: '12px 16px',
      fontSize: '13px',
      marginBottom: 'var(--sp-4)',
      lineHeight: 1.5,
      boxShadow: 'var(--shadow-xs)',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      ...style,
    }}
  >
    <div style={{ flex: 1 }}>{children}</div>
  </div>
);
