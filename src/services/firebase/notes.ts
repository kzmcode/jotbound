import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { SCHEMA_VERSION, type Note, type TagCategory } from '../../types/models';
import { getFirebase } from './app';

/** Firestore の notes 操作。UI からは動的 import で使う。 */

export type NoteRecord = Note & { id: string };
export type NoteInput = Omit<Note, 'createdAt' | 'updatedAt' | 'schemaVersion'>;
/** 保存時に一緒に作成する新しいタグ（ユーザーが確認して追加したもの） */
export type NewTag = { id: string; name: string; normalizedName: string; category: TagCategory };

function db() {
  const s = getFirebase();
  if (!s) throw new Error('Firebase is not configured');
  return s.db;
}

const notesCol = (uid: string) => collection(db(), 'users', uid, 'notes');
const tagsCol = (uid: string) => collection(db(), 'users', uid, 'tags');

/** 端末で生成する固定ID（フォームを開いた時点で決め、再送しても同じIDを使う） */
export const newNoteId = (uid: string) => doc(notesCol(uid)).id;
export const newTagId = (uid: string) => doc(tagsCol(uid)).id;

export function subscribeNotes(uid: string, onData: (notes: NoteRecord[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    query(notesCol(uid), orderBy('updatedAt', 'desc')),
    (snap) =>
      onData(snap.docs.map((d) => ({ id: d.id, ...(d.data({ serverTimestamps: 'estimate' }) as Note) }))),
    onError,
  );
}

const tagData = (t: NewTag) => ({
  name: t.name,
  normalizedName: t.normalizedName,
  category: t.category,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

/**
 * 新しいメモを保存する。同じ noteId が既にあれば何もしない（二重クリック・再送で重複しない）。
 * オンライン必須（トランザクションはオフラインでは失敗する）。
 */
export async function saveNewNote(uid: string, noteId: string, input: NoteInput, newTags: NewTag[]): Promise<'created' | 'exists'> {
  const noteRef = doc(notesCol(uid), noteId);
  return runTransaction(db(), async (tx) => {
    const existing = await tx.get(noteRef);
    if (existing.exists()) return 'exists';
    for (const t of newTags) tx.set(doc(tagsCol(uid), t.id), tagData(t));
    tx.set(noteRef, { ...input, schemaVersion: SCHEMA_VERSION, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return 'created';
  });
}

export async function updateNote(uid: string, noteId: string, input: NoteInput, newTags: NewTag[]): Promise<void> {
  const batch = writeBatch(db());
  for (const t of newTags) batch.set(doc(tagsCol(uid), t.id), tagData(t));
  batch.update(doc(notesCol(uid), noteId), { ...input, updatedAt: serverTimestamp() });
  await batch.commit();
}

export async function deleteNote(uid: string, noteId: string): Promise<void> {
  await deleteDoc(doc(notesCol(uid), noteId));
}

/** メモの本を付け替える（書籍削除前の移動用） */
export async function moveNote(uid: string, noteId: string, bookId: string): Promise<void> {
  await updateDoc(doc(notesCol(uid), noteId), { bookId, updatedAt: serverTimestamp() });
}
