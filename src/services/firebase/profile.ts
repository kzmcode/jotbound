import { doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import type { Profile } from '../../types/models';
import { getFirebase } from './app';

function db() {
  const s = getFirebase();
  if (!s) throw new Error('Firebase is not configured');
  return s.db;
}

const profileRef = (uid: string) => doc(db(), 'users', uid, 'settings', 'profile');

export function subscribeProfile(uid: string, onData: (profile: Profile | null) => void, onError: (e: Error) => void) {
  return onSnapshot(
    profileRef(uid),
    (snap) => onData(snap.exists() ? (snap.data({ serverTimestamps: 'estimate' }) as Profile) : null),
    onError,
  );
}

/** 選択中／最近利用した書籍（要件 SCR-01） */
export async function setPreferredBook(uid: string, bookId: string | null): Promise<void> {
  await updateDoc(profileRef(uid), { preferredBookId: bookId, updatedAt: serverTimestamp() });
}
