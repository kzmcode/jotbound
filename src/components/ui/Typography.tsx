import type { ReactNode } from 'react';

/** 画面タイトル（1画面に1つ）。英字の装飾見出しは eyebrow に限る。 */
export function ScreenTitle({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      {eyebrow && (
        <p className="eyebrow m-0 mb-1" aria-hidden="true">
          {eyebrow}
        </p>
      )}
      <h1 className="m-0 text-[27px] font-semibold leading-[1.2] tracking-[-0.03em]">{title}</h1>
      {subtitle && <p className="m-0 mt-1.5 text-[13px] text-text-secondary">{subtitle}</p>}
    </div>
  );
}

export function SectionHeading({ id, children, action }: { id?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 id={id} className="m-0 text-base font-semibold tracking-[-0.02em]">
        {children}
      </h2>
      {action}
    </div>
  );
}
