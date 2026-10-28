import { useState } from 'react';
import { isTrustedCoverUrl } from './bookUtils';

/**
 * 書影。信頼できる提供元の画像のみ遅延読み込みし、未取得・読み込み失敗時は書名入りの代替表紙を出す。
 * 代替表紙は実在の書影に見せかけない単色のプレースホルダー。
 */
export function BookCover({
  title,
  coverUrl,
  size = 'md',
  className = '',
}: {
  title: string;
  coverUrl: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = isTrustedCoverUrl(coverUrl) && !failed;
  const text = size === 'sm' ? 'text-[9px]' : size === 'lg' ? 'text-[14px]' : 'text-[11px]';
  return (
    <div
      className={`relative aspect-[2/3] w-full overflow-hidden rounded-[10px] border border-border bg-surface-subtle shadow-[0_6px_18px_rgba(var(--aura-shadow-rgb),var(--aura-shadow-alpha))] ${className}`}
    >
      {showImage ? (
        <img
          src={coverUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <div aria-hidden="true" className="flex size-full flex-col justify-between bg-halo-outer p-[10%]">
          <span className="block h-[3px] w-1/3 rounded-full bg-accent" />
          <span className={`line-clamp-4 font-semibold leading-snug text-text ${text}`}>{title}</span>
        </div>
      )}
    </div>
  );
}
