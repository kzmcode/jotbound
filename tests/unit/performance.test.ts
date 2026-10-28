import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { buildBackup } from '../../src/features/backup/backupFormat';
import { planImport, readBackup } from '../../src/features/backup/importPlan';
import { emptyFilter, searchNotes } from '../../src/features/notes/noteSearch';
import { makeBook, makeNote, makeTag } from './helpers';

/**
 * 1万件規模の端末内処理の実測（要件 9章: 個人用途で全件を端末にキャッシュして検索する）。
 * CI の揺れを考えて上限は緩めにし、実測値はログに出す。
 */
const N = 10_000;
const books = Array.from({ length: 200 }, (_, i) => makeBook({ id: `b${i}`, title: `本 ${i} 教育と学び`, titleNormalized: `本${i}教育と学び`, authors: [`著者${i}`] }));
const tags = Array.from({ length: 60 }, (_, i) => makeTag({ id: `t${i}`, name: `タグ${i}`, normalizedName: `タグ${i}`, category: i % 2 ? 'usage' : 'topic' }));
const notes = Array.from({ length: N }, (_, i) =>
  makeNote({
    id: `n${i}`,
    bookId: `b${i % 200}`,
    pageStart: (i % 300) + 1,
    quote: `引用 ${i} 読みかけの本のほうが、考えを遠くまで運んでくれる`.repeat(3),
    comment: `コメント ${i} 次の授業の参考にしたい。`,
    topicTagIds: [`t${(i % 30) * 2}`],
    usageTagIds: [`t${(i % 30) * 2 + 1}`],
    createdAt: Timestamp.fromMillis(1_700_000_000_000 + i * 60_000),
    updatedAt: Timestamp.fromMillis(1_700_000_000_000 + i * 60_000),
  }),
);
const booksById = new Map(books.map((b) => [b.id, b]));
const tagsById = new Map(tags.map((t) => [t.id, t]));

function time<T>(label: string, fn: () => T): { ms: number; value: T } {
  fn(); // 1回目は JIT の準備
  const start = performance.now();
  const value = fn();
  const ms = performance.now() - start;
  console.info(`[性能] ${label}: ${ms.toFixed(1)}ms`);
  return { ms, value };
}

describe('1万件規模の性能', () => {
  it('全文検索・絞り込み・並べ替えが 1 回あたり 300ms 未満', () => {
    const q = time('検索「授業 教育」', () => searchNotes(notes, { ...emptyFilter, query: '授業 教育' }, booksById, tagsById));
    expect(q.value).toHaveLength(N);
    expect(q.ms).toBeLessThan(300);

    const narrow = time('検索「9999」+ タグ絞り込み', () =>
      searchNotes(notes, { ...emptyFilter, query: '9999', topicTagId: 't18' }, booksById, tagsById),
    );
    expect(narrow.value.map((n) => n.id)).toEqual(['n9999']);
    expect(narrow.ms).toBeLessThan(300);

    const sorted = time('書籍ごとのページ順', () => searchNotes(notes, { ...emptyFilter, sort: 'bookPage' }, booksById, tagsById));
    expect(sorted.ms).toBeLessThan(300);
  });

  it('JSON の書き出しと読み込みの計画が 2 秒未満', () => {
    const exported = time('JSON 書き出し', () => JSON.stringify(buildBackup({ books, tags, notes, profile: null })));
    expect(exported.ms).toBeLessThan(2000);
    console.info(`[性能] JSON サイズ: ${(exported.value.length / 1024 / 1024).toFixed(1)}MB`);
    const plan = time('読み込みの検証・計画', () => planImport(readBackup(exported.value), { books: [], tags: [], noteIds: new Set() }, 'skip'));
    expect(plan.value.notes).toHaveLength(N);
    expect(plan.ms).toBeLessThan(2000);
  });
});
