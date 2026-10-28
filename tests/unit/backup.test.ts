import { describe, expect, it } from 'vitest';
import { buildBackup, markdownFileName, safeFileName } from '../../src/features/backup/backupFormat';
import { BackupFileError, planImport, readBackup, writeCount, type ExistingData } from '../../src/features/backup/importPlan';
import { allToMarkdown, bookToMarkdown, citation, noteToMarkdown } from '../../src/features/backup/markdown';
import { makeBook, makeNote, makeTag } from './helpers';

const now = new Date('2026-10-27T12:00:00Z');
const empty: ExistingData = { books: [], tags: [], noteIds: new Set() };

function sampleData() {
  const books = [makeBook(), makeBook({ id: 'b2', title: '教育の力', titleNormalized: '教育の力', isbn13: null })];
  const tags = [makeTag(), makeTag({ id: 't2', name: '授業', normalizedName: '授業', category: 'usage' })];
  const notes = [
    makeNote({ topicTagIds: ['t1'], usageTagIds: ['t2'], transcript: '静かな読書の技法の70ページ…' }),
    makeNote({ id: 'n2', bookId: 'b2', pageStart: null, quote: '', comment: 'コメントだけのメモ', usageStatus: 'unassigned' }),
  ];
  return { books, tags, notes, profile: { preferredModel: 'gemini-3.5-flash-lite' as const, preferredBookId: 'b2', schemaVersion: 1 as const, updatedAt: null as never } };
}

const roundTrip = (data = sampleData()) => readBackup(JSON.stringify(buildBackup(data, now)));

describe('JSON エクスポート', () => {
  it('保存しているフィールドだけを ID・時刻つきで書き出す', () => {
    const backup = buildBackup(sampleData(), now);
    expect(backup).toMatchObject({ format: 'jotbound-backup', version: 1, schemaVersion: 1, exportedAt: now.toISOString(), settings: { preferredBookId: 'b2' } });
    expect(backup.books).toHaveLength(2);
    expect(Object.keys(backup.notes[0]!).sort()).toEqual(
      ['bookId', 'comment', 'createdAt', 'id', 'inputMethod', 'pageEnd', 'pageStart', 'quote', 'schemaVersion', 'topicTagIds', 'transcript', 'updatedAt', 'usageStatus', 'usageTagIds'].sort(),
    );
    expect(backup.notes[0]!.createdAt).toBe(new Date('2026-10-20T10:00:00').toISOString());
  });

  it('ファイル名に使えない文字を除く', () => {
    expect(safeFileName('a/b:c*?"<>|\n d')).toBe('abc d');
    expect(safeFileName('   ')).toBe('untitled');
    expect(markdownFileName('学問/教育', new Date(2026, 9, 27, 9, 5))).toBe('jotbound-学問教育-20261027-0905.md');
  });
});

describe('JSON インポート: ファイルの確認', () => {
  it('JSON でない・形式が違う・新しい版は理由を区別する', () => {
    const reason = (text: string) => {
      try {
        readBackup(text);
        return 'ok';
      } catch (e) {
        return e instanceof BackupFileError ? e.reason : 'other';
      }
    };
    expect(reason('{')).toBe('json');
    expect(reason(JSON.stringify({ format: 'other', version: 1 }))).toBe('format');
    expect(reason(JSON.stringify({ format: 'jotbound-backup', version: 2 }))).toBe('version');
    expect(reason(JSON.stringify({ format: 'jotbound-backup', version: 1 }))).toBe('ok');
    // 旧アプリ名（Lumiq）の版で書き出したファイルも読み込める
    expect(reason(JSON.stringify({ format: 'lumiq-backup', version: 1 }))).toBe('ok');
  });
});

describe('JSON インポート: 計画', () => {
  it('空のプロジェクトへの復元で ID と関係（本・タグ）を保つ', () => {
    const plan = planImport(roundTrip(), empty, 'skip', now);
    expect(plan.counts).toEqual({
      books: { create: 2, update: 0, skip: 0 },
      tags: { create: 2, update: 0, skip: 0 },
      notes: { create: 2, update: 0, skip: 0 },
    });
    const n1 = plan.notes.find((n) => n.id === 'n1')!;
    expect(n1.data).toMatchObject({ bookId: 'b1', topicTagIds: ['t1'], usageTagIds: ['t2'], transcript: '静かな読書の技法の70ページ…' });
    expect(n1.createdAt?.toISOString()).toBe(new Date('2026-10-20T10:00:00').toISOString());
    expect(plan.preferredBookId).toBe('b2');
    expect(plan.invalid).toEqual([]);
    expect(writeCount(plan)).toBe(6);
  });

  it('同じ ID が既にあれば、スキップでは書かず、更新では update にする', () => {
    const data = sampleData();
    const existing: ExistingData = { books: data.books, tags: data.tags, noteIds: new Set(['n1', 'n2']) };
    const skip = planImport(roundTrip(), existing, 'skip', now);
    expect(writeCount(skip)).toBe(0);
    expect(skip.counts.notes).toEqual({ create: 0, update: 0, skip: 2 });

    const update = planImport(roundTrip(), existing, 'update', now);
    expect(update.counts.books).toEqual({ create: 0, update: 2, skip: 0 });
    expect(update.notes.every((n) => n.mode === 'update' && n.createdAt === null)).toBe(true);
    expect(update.similarBooks).toEqual([]);
  });

  it('同じ名前のタグが別 ID で既にあれば、新しく作らずメモの参照を付け替える', () => {
    const existing: ExistingData = { books: [], tags: [makeTag({ id: 'mine', name: 'きょういく', normalizedName: 'きょういく' }), makeTag({ id: 'mine2', name: '教育' })], noteIds: new Set() };
    const plan = planImport(roundTrip(), existing, 'skip', now);
    expect(plan.mergedTags).toBe(1);
    expect(plan.tags.map((t) => t.id)).toEqual(['t2']);
    expect(plan.notes.find((n) => n.id === 'n1')!.data.topicTagIds).toEqual(['mine2']);
  });

  it('別 ID で同じ書名・ISBN の本があれば知らせる（別の本として追加する）', () => {
    const existing: ExistingData = { books: [{ id: 'other', title: '静かな 読書の技法', isbn13: null }], tags: [], noteIds: new Set() };
    const plan = planImport(roundTrip(), existing, 'skip', now);
    expect(plan.similarBooks).toEqual(['静かな読書の技法']);
    expect(plan.counts.books.create).toBe(2);
  });

  it('Rules を満たさない項目は取り込まずに理由を示す', () => {
    const file = readBackup(
      JSON.stringify({
        format: 'jotbound-backup',
        version: 1,
        books: [
          { id: 'b1', title: '本' },
          { id: 'b1', title: '同じID' },
          { id: 'a/b', title: 'スラッシュ' },
          { id: 'b3', title: '　' },
        ],
        tags: [{ id: 't1', name: '教育', category: 'topic' }],
        notes: [
          { id: 'n1', bookId: 'b1', quote: '引用', topicTagIds: ['t1', 'gone'], usageTagIds: ['t1'] },
          { id: 'n2', bookId: 'nope', quote: '本がない' },
          { id: 'n3', bookId: 'b1', quote: ' ', comment: '　' },
          { id: 'n4', bookId: 'b1', quote: 'x', pageStart: 10, pageEnd: 5 },
          { id: 'n5', bookId: 'b1', quote: 'x', pageStart: 0 },
        ],
      }),
    );
    const plan = planImport(file, empty, 'skip', now);
    expect(plan.invalid.map((i) => [i.kind, i.id, i.reason])).toEqual([
      ['book', 'b1', 'duplicateId'],
      ['book', 'a/b', 'format'],
      ['book', 'b3', 'format'],
      ['note', 'n2', 'missingBook'],
      ['note', 'n3', 'body'],
      ['note', 'n4', 'pages'],
      ['note', 'n5', 'format'],
    ]);
    // 見つからないタグ・種類が違う参照は外す
    expect(plan.notes[0]!.data).toMatchObject({ topicTagIds: ['t1'], usageTagIds: [] });
    expect(plan.droppedTagRefs).toBe(2);
    expect(plan.notes[0]!.data.inputMethod).toBe('manual');
  });

  it('既存の本を参照するメモは取り込める。信頼できない書影と不正な ISBN は外す', () => {
    const file = readBackup(
      JSON.stringify({
        format: 'jotbound-backup',
        version: 1,
        books: [{ id: 'b9', title: '外部', isbn13: '123', coverUrl: 'https://evil.example/x.jpg', coverProvider: 'google', createdAt: '2999-01-01T00:00:00Z' }],
        notes: [{ id: 'n9', bookId: 'mineBook', comment: '既存の本へのメモ' }],
      }),
    );
    const plan = planImport(file, { books: [{ id: 'mineBook', title: '既存', isbn13: null }], tags: [], noteIds: new Set() }, 'skip', now);
    expect(plan.books[0]!.data).toMatchObject({ isbn13: null, coverUrl: null, coverProvider: 'none' });
    expect(plan.books[0]!.createdAt).toBeNull(); // 未来の時刻はサーバー時刻にする
    expect(plan.notes.map((n) => n.id)).toEqual(['n9']);
  });

  it('更新で別のタグと名前が重複する場合は、そのタグを更新しない', () => {
    const existing: ExistingData = {
      books: [],
      tags: [makeTag({ id: 't1', name: '旧名', normalizedName: '旧名' }), makeTag({ id: 'x', name: '教育' })],
      noteIds: new Set(),
    };
    const file = readBackup(JSON.stringify({ format: 'jotbound-backup', version: 1, tags: [{ id: 't1', name: '教育', category: 'topic' }] }));
    const plan = planImport(file, existing, 'update', now);
    expect(plan.tags).toEqual([]);
    expect(plan.counts.tags).toEqual({ create: 0, update: 0, skip: 1 });
  });
});

describe('Markdown エクスポート', () => {
  const { books, tags, notes } = sampleData();
  const tagsById = new Map(tags.map((t) => [t.id, t]));

  it('引用に書名とページを併記する', () => {
    expect(citation(books[0], notes[0]!)).toBe('— 『静かな読書の技法』p.70');
    expect(citation(books[0], { pageStart: 10, pageEnd: 12 })).toBe('— 『静かな読書の技法』p.10–12');
    const out = noteToMarkdown(notes[0]!, books[0], tagsById);
    expect(out).toContain('# 『静かな読書の技法』');
    expect(out).toContain('## p.70');
    expect(out).toContain('> 読みかけの本のほうが、考えを遠くまで運んでくれる\n>\n> — 『静かな読書の技法』p.70');
    expect(out).toContain('次の授業の参考にしたい。');
    expect(out).toContain('- テーマ: #教育');
    expect(out).toContain('- 活用先: #授業');
    expect(out).toContain('- 活用状態: 活用予定');
  });

  it('複数行の引用もすべて引用ブロックにする。コメントだけのメモに引用は出さない', () => {
    const out = noteToMarkdown(makeNote({ quote: '一行目\n\n二行目' }), books[0], tagsById);
    expect(out).toContain('> 一行目\n>\n> 二行目');
    const commentOnly = noteToMarkdown(notes[1]!, books[1], tagsById);
    expect(commentOnly).not.toContain('>');
    expect(commentOnly).toContain('## ページ指定なし');
  });

  it('書籍単位はその本のメモだけをページ順に、全体は本ごとにまとめる', () => {
    const more = [...notes, makeNote({ id: 'n3', pageStart: 12, quote: '前のページ' })];
    const book = bookToMarkdown(books[0]!, more, tagsById);
    expect(book).toContain('メモ 2件');
    expect(book.indexOf('## p.12')).toBeLessThan(book.indexOf('## p.70'));
    expect(book).not.toContain('コメントだけのメモ');

    const all = allToMarkdown(books, more, tagsById, now);
    expect(all).toMatch(/^# Jotbound 読書メモ/);
    expect(all).toContain('## 『静かな読書の技法』');
    expect(all).toContain('## 『教育の力』');
    expect(all).toContain('### p.12');
  });
});
