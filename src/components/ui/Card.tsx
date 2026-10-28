import type { HTMLAttributes } from 'react';

/** 補助的な透過カード（一覧・ナビ等）。長文本文には SurfaceCard を使う。 */
export function GlassCard({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`glass rounded-lg ${className}`} {...rest} />;
}

/** 可読性を優先する不透明カード（本文・編集フォーム）。 */
export function SurfaceCard({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-lg border border-border bg-surface shadow-[0_16px_40px_rgba(var(--aura-shadow-rgb),var(--aura-shadow-alpha))] ${className}`}
      {...rest}
    />
  );
}
