import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Profile } from '../../types/models';

const loadProfileRepo = () => import('../../services/firebase/profile');

type ProfileValue = {
  profile: Profile | null;
  /** 選択中の本を変更する（失敗しても録音は続けられるため、エラーは呼び出し側に返さない） */
  setPreferredBook: (bookId: string | null) => void;
};

const ProfileContext = createContext<ProfileValue | null>(null);

export function ProfileProvider({ uid, children }: { uid: string; children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void loadProfileRepo().then((repo) => {
      if (!cancelled) unsubscribe = repo.subscribeProfile(uid, setProfile, () => {});
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [uid]);

  const setPreferredBook = useCallback(
    (bookId: string | null) => {
      setProfile((p) => (p ? { ...p, preferredBookId: bookId } : p));
      void loadProfileRepo()
        .then((repo) => repo.setPreferredBook(uid, bookId))
        .catch(() => {});
    },
    [uid],
  );

  const value = useMemo(() => ({ profile, setPreferredBook }), [profile, setPreferredBook]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}
