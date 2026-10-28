import { useSyncExternalStore } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { copy } from '../../app/copy';
import { OfflineIcon } from '../icons';
import { Button } from '../ui/Button';
import { Notice } from '../ui/Feedback';

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <Notice icon={<OfflineIcon size={18} />} live="polite">
      {copy.offline}
    </Notice>
  );
}

export function SetupNotice({ missing }: { missing: readonly string[] }) {
  return (
    <Notice tone="error">
      <p className="m-0 font-semibold">{copy.setup.title}</p>
      <p className="m-0 mt-1 text-text-secondary">{copy.setup.body}</p>
      <p className="m-0 mt-2 break-all font-mono text-[12px]">
        {copy.setup.missing}: {missing.join(', ')}
      </p>
    </Notice>
  );
}

/** 新しい Service Worker がある場合のみ表示し、ユーザー操作で更新する。 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <Notice
      live="polite"
      action={
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" className="min-h-9 px-3 text-[13px]" onClick={() => setNeedRefresh(false)}>
            {copy.update.dismiss}
          </Button>
          <Button className="min-h-9 px-3 text-[13px]" onClick={() => updateServiceWorker(true)}>
            {copy.update.reload}
          </Button>
        </div>
      }
    >
      {copy.update.available}
    </Notice>
  );
}

/** 画面ヘッダーの直後に置く状態バナー（設定不足・オフライン・更新）。 */
export function Banners() {
  return (
    <div className="mb-6 flex flex-col gap-2 empty:hidden">
      <OfflineBanner />
      <UpdatePrompt />
    </div>
  );
}
