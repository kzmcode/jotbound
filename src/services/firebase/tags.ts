import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { Tag, TagCategory } from '../../types/models';
import { getFirebase } from './app';

/** Firestore の tags 操作。UI からは動的 import で使う。 */

export type TagRecord = Tag & { id: string };

function db() {
  const s = getFirebase();
  if (!s) throw new Error('Firebase is not configured');
  return s.db;
}

const tagsCol = (uid: string) => collection(db(), 'users', uid, 'tags');
const notesCol = (uid: string) => collection(db(), 'users', uid, 'notes');
const tagField = (category: TagCategory) => (category === 'topic' ? 'topicTagIds' : 'usageTagIds');

export function subscribeTags(uid: string, onData: (tags: TagRecord[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    query(tagsCol(uid), orderBy('normalizedName')),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...(d.data({ serverTimestamps: 'estimate' }) as Tag) }))),
    onError,
  );
}

export async function createTag(uid: string, name: string, normalizedName: string, category: TagCategory): Promise<string> {
  const ref = doc(tagsCol(uid));
  await setDoc(ref, { name, normalizedName, category, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

/** 改名はタグ文書だけを更新する（メモは ID で参照しているため書き換え不要） */
export async function renameTag(uid: string, id: string, name: string, normalizedName: string): Promise<void> {
  await updateDoc(doc(tagsCol(uid), id), { name, normalizedName, updatedAt: serverTimestamp() });
}

/**
 * タグを含むメモの配列を書き換え、最後にタグ文書を削除する。
 * replaceWith を指定すると統合（source を target に置き換え）、省略すると削除。
 * 1バッチ500件の上限があるため分割して書き込む。
 */
async function rewriteNotesAndDelete(uid: string, category: TagCategory, sourceId: string, replaceWith?: string) {
  const field = tagField(category);
  const snap = await getDocs(query(notesCol(uid), where(field, 'array-contains', sourceId)));
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db());
    for (const d of docs.slice(i, i + 400)) {
      const current = (d.get(field) as string[]) ?? [];
      const next = current.filter((id) => id !== sourceId);
      if (replaceWith && !next.includes(replaceWith)) next.push(replaceWith);
      batch.update(d.ref, { [field]: next, updatedAt: serverTimestamp() });
    }
    await batch.commit();
  }
  const final = writeBatch(db());
  final.delete(doc(tagsCol(uid), sourceId));
  await final.commit();
}

export const mergeTag = (uid: string, category: TagCategory, sourceId: string, targetId: string) =>
  rewriteNotesAndDelete(uid, category, sourceId, targetId);

export const deleteTag = (uid: string, category: TagCategory, id: string) => rewriteNotesAndDelete(uid, category, id);
