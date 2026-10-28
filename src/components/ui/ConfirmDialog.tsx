import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button';

/** ネイティブ <dialog> による確認。Esc で閉じ、フォーカスはブラウザが管理する。 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(420px,calc(100vw-32px))] rounded-lg border border-border bg-surface p-6 text-text shadow-xl backdrop:bg-[rgba(var(--aura-shadow-rgb),0.45)]"
    >
      <h2 id={titleId} className="m-0 text-[18px] font-semibold">
        {title}
      </h2>
      <div className="mt-2 text-[14px] leading-relaxed">{children}</div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={busy}
          aria-busy={busy}
          className={destructive ? '!bg-error !text-surface' : ''}
        >
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
