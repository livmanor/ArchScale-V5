import React from 'react';

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactElement;
}

export const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 'var(--input-height)',
  padding: '0 14px',
  border: '1px solid #d0d5dd',
  borderRadius: 'var(--radius)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontSize: '13px',
  outline: 'none',
  transition: 'border-color var(--transition), box-shadow var(--transition)',
  boxSizing: 'border-box' as const,
  boxShadow: 'var(--shadow-xs)',
};

export const FormField: React.FC<FieldProps> = ({ label, hint, error, required, children }) => (
  <div style={{ marginBottom: 16 }}>
    <label style={{
      display: 'block',
      fontSize: '13px',
      fontWeight: 500,
      color: '#344054',
      marginBottom: 6,
    }}>
      {label}
      {required && <span style={{ color: 'var(--color-error)', marginLeft: 3 }}>*</span>}
    </label>
    {hint && (
      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: 6 }}>
        {hint}
      </div>
    )}
    {children}
    {error && (
      <div style={{ fontSize: '12px', color: 'var(--color-error)', marginTop: 4, fontWeight: 500 }}>
        {error}
      </div>
    )}
  </div>
);

export const TextInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { hasError?: boolean }
>(({ hasError, style, ...props }, ref) => (
  <input
    ref={ref}
    {...props}
    style={{
      ...inputStyle,
      ...(hasError ? { borderColor: 'var(--color-error)' } : {}),
      ...style,
    }}
    onFocus={e => {
      e.currentTarget.style.borderColor = 'var(--color-accent)';
      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(249, 115, 22, 0.15)';
      props.onFocus?.(e);
    }}
    onBlur={e => {
      e.currentTarget.style.borderColor = hasError ? 'var(--color-error)' : '#d0d5dd';
      e.currentTarget.style.boxShadow = 'var(--shadow-xs)';
      props.onBlur?.(e);
    }}
  />
));
TextInput.displayName = 'TextInput';

export const SelectInput = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { hasError?: boolean }
>(({ hasError, style, ...props }, ref) => (
  <select
    ref={ref}
    {...props}
    style={{
      ...inputStyle,
      cursor: 'pointer',
      ...(hasError ? { borderColor: 'var(--color-error)' } : {}),
      ...style,
    }}
    onFocus={e => {
      e.currentTarget.style.borderColor = 'var(--color-accent)';
      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(249, 115, 22, 0.15)';
      props.onFocus?.(e);
    }}
    onBlur={e => {
      e.currentTarget.style.borderColor = hasError ? 'var(--color-error)' : '#d0d5dd';
      e.currentTarget.style.boxShadow = 'var(--shadow-xs)';
      props.onBlur?.(e);
    }}
  />
));
SelectInput.displayName = 'SelectInput';

export const TextareaInput = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { hasError?: boolean }
>(({ hasError, style, ...props }, ref) => (
  <textarea
    ref={ref}
    {...props}
    style={{
      ...inputStyle,
      height: 'auto',
      padding: '10px 14px',
      resize: 'vertical',
      minHeight: 80,
      ...(hasError ? { borderColor: 'var(--color-error)' } : {}),
      ...style,
    }}
    onFocus={e => {
      e.currentTarget.style.borderColor = 'var(--color-accent)';
      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(249, 115, 22, 0.15)';
      props.onFocus?.(e);
    }}
    onBlur={e => {
      e.currentTarget.style.borderColor = hasError ? 'var(--color-error)' : '#d0d5dd';
      e.currentTarget.style.boxShadow = 'var(--shadow-xs)';
      props.onBlur?.(e);
    }}
  />
));
TextareaInput.displayName = 'TextareaInput';
