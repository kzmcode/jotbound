import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { NoteDraft } from '../features/notes/noteDraft';
import type { ExtractedMemo, ExtractionErrorKind } from '../services/ai/types';

/**
 * 録音の下書き（端末内の IndexedDB のみ。Firestore や Cloud Storage には保存しない。要件 FR-VOICE）。
 * 確定保存後に削除する。ブラウザのデータ削除で失われ得る。
 */

export type StopReason = 'user' | 'duration' | 'size' | 'interrupted';

export type AudioDraft = {
  id: string;
  /** 録音したアカウント。同じ端末で別のアカウントにログインしても見えないようにする */
  uid: string;
  /** 確定保存に使う固定のメモID（再送しても重複しない） */
  noteId: string;
  createdAt: number;
  updatedAt: number;
  audio: Blob;
  mimeType: string;
  durationMs: number;
  size: number;
  bookId: string | null;
  stopReason: StopReason;
  /**
   * AI 解析の記録。結果を端末に残すことで、確認を後回しにしても再解析（無料枠の消費）を不要にする。
   * attempts は送信した回数（自動再試行はしない）。
   */
  analysis?: DraftAnalysis;
  /** 「あとで確認する」を選んだときの入力途中の内容 */
  form?: NoteDraft | null;
};

export type DraftAnalysis = {
  attempts: number;
  result: ExtractedMemo | null;
  lastError: ExtractionErrorKind | null;
  updatedAt: number;
};

export type DraftSummary = Omit<AudioDraft, 'audio'>;

/**
 * 保存する形。iOS Safari は IndexedDB への Blob の保存に失敗することがある（WebKit の既知の問題）ため、
 * 音声は ArrayBuffer で保存し、読み出すときに Blob に戻す。以前の版で Blob のまま保存したものも読める。
 */
type StoredDraft = Omit<AudioDraft, 'audio' | 'uid'> & { uid?: string; audio?: Blob; audioData?: ArrayBuffer };

interface DraftDB extends DBSchema {
  drafts: { key: string; value: StoredDraft; indexes: { createdAt: number } };
}

const toDraft = ({ audio, audioData, ...rest }: StoredDraft, uid: string): AudioDraft => ({
  ...rest,
  uid,
  audio: audio ?? new Blob(audioData ? [audioData] : [], { type: rest.mimeType }),
});

/**
 * そのアカウントの下書きか。uid のない下書き（UID を記録する前の版で作ったもの）は、
 * 最初に開いたアカウントのものとして扱い、uid を記録する。
 */
async function ownedBy(stored: StoredDraft | undefined, uid: string): Promise<StoredDraft | undefined> {
  if (!stored) return undefined;
  if (stored.uid === uid) return stored;
  if (stored.uid !== undefined) return undefined;
  const claimed = { ...stored, uid };
  await (await db()).put('drafts', claimed);
  return claimed;
}

const DB_NAME = 'jotbound-drafts';
/** 旧アプリ名（Lumiq）の版の下書き DB。最初に開いたときに新しい DB へ移して削除する。 */
const LEGACY_DB_NAME = 'lumiq-drafts';
let dbPromise: Promise<IDBPDatabase<DraftDB>> | null = null;

function db() {
  dbPromise ??= openDB<DraftDB>(DB_NAME, 1, {
    upgrade(database) {
      const store = database.createObjectStore('drafts', { keyPath: 'id' });
      store.createIndex('createdAt', 'createdAt');
    },
  }).then(async (database) => {
    await migrateLegacyDrafts(database);
    return database;
  });
  return dbPromise;
}

async function migrateLegacyDrafts(database: IDBPDatabase<DraftDB>) {
  try {
    // 存在しない DB を openDB すると空の DB が作られるため、一覧で確かめてから開く
    const names = (await indexedDB.databases?.())?.map((d) => d.name) ?? [];
    if (!names.includes(LEGACY_DB_NAME)) return;
    const legacy = await openDB<DraftDB>(LEGACY_DB_NAME, 1);
    const drafts = legacy.objectStoreNames.contains('drafts') ? await legacy.getAll('drafts') : [];
    legacy.close();
    const tx = database.transaction('drafts', 'readwrite');
    await Promise.all([...drafts.map((d) => tx.store.put(d)), tx.done]);
    await deleteDB(LEGACY_DB_NAME);
  } catch {
    // 移行に失敗しても新しい DB は使える。旧 DB は残るので、次回の起動時に再試行する
  }
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function onDraftsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function saveDraft(draft: AudioDraft): Promise<void> {
  const { audio, ...rest } = draft;
  // 変換はトランザクションの外で行う（await を挟むとトランザクションが閉じるため）
  const audioData = await audio.arrayBuffer();
  await (await db()).put('drafts', { ...rest, audioData });
  notify();
}

/** 下書きを1件読む。別のアカウントの下書きは見つからないものとして扱う */
export async function getDraft(id: string, uid: string): Promise<AudioDraft | undefined> {
  const stored = await ownedBy(await (await db()).get('drafts', id), uid);
  return stored && toDraft(stored, uid);
}

/** そのアカウントの下書きの一覧（音声データは除く）。新しい順。 */
export async function listDrafts(uid: string): Promise<DraftSummary[]> {
  const all = await (await db()).getAllFromIndex('drafts', 'createdAt');
  const mine: DraftSummary[] = [];
  for (const stored of all.reverse()) {
    const owned = await ownedBy(stored, uid);
    if (!owned) continue;
    const { audio: _audio, audioData: _data, ...rest } = owned;
    mine.push({ ...rest, uid });
  }
  return mine;
}

export async function updateDraft(id: string, patch: Partial<Omit<AudioDraft, 'id' | 'uid' | 'audio'>>): Promise<void> {
  const database = await db();
  const current = await database.get('drafts', id);
  if (!current) return;
  await database.put('drafts', { ...current, ...patch, updatedAt: Date.now() });
  notify();
}

export async function deleteDraft(id: string): Promise<void> {
  await (await db()).delete('drafts', id);
  notify();
}

export async function deleteDrafts(ids: string[]): Promise<void> {
  const tx = (await db()).transaction('drafts', 'readwrite');
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
  notify();
}

/** テスト用: 接続を閉じて次回開き直す */
export async function resetDraftsDbForTest(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}
