import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';

type Variant = 'primary' | 'secondary' | 'ghost';

const base =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 text-[15px] font-semibold ' +
  'transition-[background-color,border-color,transform] duration-[160ms] active:scale-[0.98] ' +
  'disabled:opacity-55 disabled:active:scale-100';

/** 主CTAは小さい白文字のコントラストを満たすため accent-strong を使う（DESIGN_SYSTEM 2章） */
const variants: Record<Variant, string> = {
  primary: 'bg-accent-strong text-accent-fg hover:brightness-105',
  secondary: 'border border-border bg-surface text-text hover:border-accent',
  ghost: 'text-accent-strong hover:bg-surface',
};

export function buttonClass(variant: Variant = 'primary', extra = '') {
  return `${base} ${variants[variant]} ${extra}`.trim();
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: ReactNode };

export function Button({ variant = 'primary', icon, className = '', children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}

type ButtonLinkProps = LinkProps & { variant?: Variant; icon?: ReactNode };

export function ButtonLink({ variant = 'primary', icon, className = '', children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClass(variant, typeof className === 'string' ? className : '')} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

const iconBase =
  'inline-flex size-11 items-center justify-center rounded-sm text-text-secondary ' +
  'transition-colors duration-[160ms] hover:bg-surface hover:text-text';

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { label: string };

/** アイコンのみのボタン。label は必須（アクセシブル名）。タップ領域44px。 */
export function IconButton({ label, className = '', children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button type={type} aria-label={label} title={label} className={`${iconBase} ${className}`} {...rest}>
      {children}
    </button>
  );
}

type IconLinkProps = LinkProps & { label: string };

export function IconLink({ label, className = '', children, ...rest }: IconLinkProps) {
  return (
    <Link aria-label={label} title={label} className={`${iconBase} ${typeof className === 'string' ? className : ''}`} {...rest}>
      {children}
    </Link>
  );
}
