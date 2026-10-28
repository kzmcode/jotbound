import { useEffect, useState } from 'react';
import { useSessionUser } from '../../app/auth';
import { listDrafts, onDraftsChanged, type DraftSummary } from '../../storage/drafts';

/** ログイン中のアカウントの、端末内の録音下書き（確認待ち）の一覧。IndexedDB が使えない環境では空として扱う。 */
export function useDrafts(): { drafts: DraftSummary[]; loaded: boolean } {
  const { uid } = useSessionUser();
  const [state, setState] = useState<{ drafts: DraftSummary[]; loaded: boolean }>({ drafts: [], loaded: false });
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      listDrafts(uid)
        .then((drafts) => !cancelled && setState({ drafts, loaded: true }))
        .catch(() => !cancelled && setState({ drafts: [], loaded: true }));
    void load();
    const off = onDraftsChanged(() => void load());
    return () => {
      cancelled = true;
      off();
    };
  }, [uid]);
  return state;
}
