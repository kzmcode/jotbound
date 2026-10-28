import type { ReactNode } from 'react';
import { AlertIcon, SparkleIcon } from '../icons';

type NoticeTone = 'info' | 'error' | 'success';

const toneClass: Record<NoticeTone, string> = {
  info: 'text-text',
  error: 'text-text border-error',
  success: 'text-text border-success',
};
const toneIcon: Record<NoticeTone, string> = {
  info: 'text-accent-strong',
  error: 'text-error',
  success: 'text-success',
};

/** 状態は色だけでなくアイコンと文言で伝える。 */
export function Notice({
  tone = 'info',
  icon,
  children,
  action,
  live,
}: {
  tone?: NoticeTone;
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  /** 状態変化を読み上げる場合に指定 */
  live?: 'polite' | 'assertive';
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : live ? 'status' : undefined}
      aria-live={tone === 'error' ? undefined : live}
      className={`flex items-start gap-3 rounded-md border border-border bg-surface px-4 py-3 text-[13px] leading-relaxed ${toneClass[tone]}`}
    >
      <span className={`mt-0.5 shrink-0 ${toneIcon[tone]}`}>
        {icon ?? (tone === 'error' ? <AlertIcon size={18} /> : <SparkleIcon size={18} />)}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-surface-subtle px-6 py-10 text-center">
      {icon && <span className="flex size-12 items-center justify-center rounded-md bg-halo-outer text-accent-strong">{icon}</span>}
      <p className="m-0 text-[15px] font-semibold text-text">{title}</p>
      {hint && <p className="m-0 max-w-xs text-[13px] text-text-secondary">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-sm ${className}`} />;
}
