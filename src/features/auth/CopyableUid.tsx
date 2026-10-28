import { useState } from 'react';
import { copy } from '../../app/copy';

export function CopyableUid({ uid }: { uid: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(uid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードが使えない環境では手動で選択してもらう
    }
  };
  return (
    <div className="mt-2 flex items-center gap-2 rounded-sm border border-border bg-surface-subtle py-1 pl-3 pr-1">
      <code className="min-w-0 flex-1 select-all break-all text-[12px]" data-testid="uid">
        {uid}
      </code>
      <button
        type="button"
        onClick={onCopy}
        className="min-h-11 shrink-0 rounded-sm px-3 text-[12px] font-semibold text-accent-strong hover:bg-surface"
      >
        <span aria-live="polite">{copied ? copy.settings.copied : copy.settings.copyUid}</span>
      </button>
    </div>
  );
}
