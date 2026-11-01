import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const VARIANTS: Record<string, React.CSSProperties> = {
  primary: {
    background: 'var(--color-accent)',
    color: '#ffffff',
    borderColor: 'var(--color-accent)',
    boxShadow: 'var(--shadow-xs)',
  },
  secondary: {
    background: '#ffffff',
    color: '#344054',
    borderColor: '#d0d5dd',
    boxShadow: 'var(--shadow-xs)',
  },
  danger: {
    background: 'var(--color-error)',
    color: '#ffffff',
    borderColor: 'var(--color-error)',
    boxShadow: 'var(--shadow-xs)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-text-muted)',
    borderColor: 'transparent',
  },
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, children, disabled, style, ...rest }, ref) => {
    const isSm = size === 'sm';
    const isLg = size === 'lg';
    
    const base: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: isSm ? 30 : isLg ? 44 : 'var(--btn-height)',
      padding: isSm ? '0 12px' : isLg ? '0 20px' : '0 16px',
      borderRadius: 'var(--radius)',
      border: '1px solid transparent',
      fontWeight: variant === 'primary' ? 600 : 500,
      fontSize: isSm ? 12 : 13,
      cursor: disabled || loading ? 'not-allowed' : 'pointer',
      opacity: disabled || loading ? 0.6 : 1,
      transition: 'all var(--transition)',
      whiteSpace: 'nowrap',
      lineHeight: 1,
      userSelect: 'none',
      ...VARIANTS[variant],
      ...style,
    };

    return (
      <button
        ref={ref}
        {...rest}
        disabled={disabled || loading}
        style={base}
        onMouseEnter={e => {
          if (disabled || loading) return;
          if (variant === 'primary') {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-accent-hover)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-accent-hover)';
          } else if (variant === 'secondary') {
            (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb';
            (e.currentTarget as HTMLButtonElement).style.color = '#101828';
          } else if (variant === 'ghost') {
            (e.currentTarget as HTMLButtonElement).style.background = '#f2f4f7';
            (e.currentTarget as HTMLButtonElement).style.color = '#101828';
          }
        }}
        onMouseLeave={e => {
          if (disabled || loading) return;
          if (variant === 'primary') {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-accent)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-accent)';
          } else if (variant === 'secondary') {
            (e.currentTarget as HTMLButtonElement).style.background = '#ffffff';
            (e.currentTarget as HTMLButtonElement).style.color = '#344054';
          } else if (variant === 'ghost') {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-muted)';
          }
        }}
      >
        {loading ? <span style={{ fontSize: 16 }}>⋯</span> : children}
      </button>
    );
  }
);

Button.displayName = 'Button';
