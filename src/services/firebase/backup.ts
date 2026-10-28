import { collection, doc, serverTimestamp, Timestamp, writeBatch, type DocumentReference } from 'firebase/firestore';
import type { ImportPlan, PlannedWrite } from '../../features/backup/importPlan';
import { SCHEMA_VERSION } from '../../types/models';
import { getFirebase } from './app';

/** JSON インポートの書き込み。UI からは動的 import で使う。 */

function db() {
  const s = getFirebase();
  if (!s) throw new Error('Firebase is not configured');
  return s.db;
}

/** 1バッチの上限は500件。余裕をもって分割する */
const BATCH_SIZE = 400;

type Op = { ref: DocumentReference; write: PlannedWrite<object>; extra?: object };

async function commitAll(ops: Op[], onWritten: (n: number) => void) {
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const batch = writeBatch(db());
    const chunk = ops.slice(i, i + BATCH_SIZE);
    for (const { ref, write, extra } of chunk) {
      if (write.mode === 'create') {
        // createdAt は元の時刻を引き継ぐ（Rules は現在以前の時刻を許可）。updatedAt はサーバー時刻
        batch.set(ref, {
          ...write.data,
          ...extra,
          createdAt: write.createdAt ? Timestamp.fromDate(write.createdAt) : serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        // 更新では createdAt を変えない（Rules で不変）
        batch.update(ref, { ...write.data, ...extra, updatedAt: serverTimestamp() });
      }
    }
    await batch.commit();
    onWritten(chunk.length);
  }
}

/**
 * 計画どおりに書き込む。メモの Rules は本の存在を確認するため、タグ → 本 → メモの順にコミットする。
 * 同じIDで書くため、途中で失敗しても同じファイルを読み込み直せば続きから揃う。
 */
export async function applyImport(
  uid: string,
  plan: Pick<ImportPlan, 'tags' | 'books' | 'notes'>,
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  const col = (name: string) => collection(db(), 'users', uid, name);
  const total = plan.tags.length + plan.books.length + plan.notes.length;
  let done = 0;
  const step = (n: number) => {
    done += n;
    onProgress(done, total);
  };
  onProgress(0, total);
  await commitAll(plan.tags.map((w) => ({ ref: doc(col('tags'), w.id), write: w })), step);
  await commitAll(plan.books.map((w) => ({ ref: doc(col('books'), w.id), write: w })), step);
  await commitAll(
    plan.notes.map((w) => ({ ref: doc(col('notes'), w.id), write: w, extra: w.mode === 'create' ? { schemaVersion: SCHEMA_VERSION } : undefined })),
    step,
  );
}
