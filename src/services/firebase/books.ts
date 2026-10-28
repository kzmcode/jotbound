import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import type { Book } from '../../types/models';
import { getFirebase } from './app';

/** Firestore の books 操作。UI からは動的 import で使う。 */

export type BookRecord = Book & { id: string };
export type BookInput = Omit<Book, 'createdAt' | 'updatedAt'>;

function db() {
  const s = getFirebase();
  if (!s) throw new Error('Firebase is not configured');
  return s.db;
}

const booksCol = (uid: string) => collection(db(), 'users', uid, 'books');

export function subscribeBooks(uid: string, onData: (books: BookRecord[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    query(booksCol(uid), orderBy('updatedAt', 'desc')),
    (snap) =>
      onData(snap.docs.map((d) => ({ id: d.id, ...(d.data({ serverTimestamps: 'estimate' }) as Book) }))),
    onError,
  );
}

export async function createBook(uid: string, input: BookInput): Promise<string> {
  const ref = doc(booksCol(uid));
  await setDoc(ref, { ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function updateBook(uid: string, id: string, input: BookInput): Promise<void> {
  await updateDoc(doc(booksCol(uid), id), { ...input, updatedAt: serverTimestamp() });
}

export async function deleteBook(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(booksCol(uid), id));
}

/** 書籍削除前の確認用。サーバーで件数を数える（オフラインでは失敗する）。 */
export async function countNotesForBook(uid: string, bookId: string): Promise<number> {
  const snap = await getCountFromServer(query(collection(db(), 'users', uid, 'notes'), where('bookId', '==', bookId)));
  return snap.data().count;
}
