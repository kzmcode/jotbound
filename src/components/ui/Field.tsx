import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

/** 入力欄は不透明な面＋明確な境界線。16px 以上（iOS の自動ズーム対策）。 */
const controlClass =
  'block w-full rounded-sm border border-border bg-surface px-4 py-3 text-base leading-normal text-text ' +
  'placeholder:text-text-secondary/70 transition-[border-color] duration-[160ms] ' +
  'hover:border-accent focus-visible:border-accent aria-[invalid=true]:border-error disabled:opacity-60';

type FieldShellProps = { label: string; hint?: string; error?: string; required?: boolean; children: (ids: FieldIds) => ReactNode };
type FieldIds = { id: string; describedBy: string | undefined; invalid: boolean };

function FieldShell({ label, hint, error, required, children }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-text">
        {label}
        {required && <span className="ml-1 text-[12px] font-normal text-text-secondary">（必須）</span>}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && (
        <p id={hintId} className="m-0 text-[12px] text-text-secondary">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="m-0 text-[12px] font-medium text-error">
          {error}
        </p>
      )}
    </div>
  );
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string };

export function TextField({ label, hint, error, required, className = '', ...rest }: TextFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          aria-required={required}
          className={`${controlClass} ${className}`}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

type TextAreaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string };

export function TextAreaField({ label, hint, error, required, className = '', ...rest }: TextAreaFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          aria-required={required}
          className={`${controlClass} min-h-28 resize-y leading-relaxed ${className}`}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; error?: string };

export function SelectField({ label, hint, error, required, className = '', children, ...rest }: SelectFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          aria-required={required}
          className={`${controlClass} appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='16'%20height='16'%20fill='none'%20stroke='%2366678A'%20stroke-width='2'%3E%3Cpath%20d='m4%206%204%204%204-4'/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_14px_center] bg-no-repeat pr-10 ${className}`}
          {...rest}
        >
          {children}
        </select>
      )}
    </FieldShell>
  );
}
