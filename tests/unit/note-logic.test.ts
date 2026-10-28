import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { emptyNoteDraft, parsePage, validateNoteDraft } from '../../src/features/notes/noteDraft';
import { emptyFilter, formatPages, noteHeadline, searchNotes } from '../../src/features/notes/noteSearch';
import { findSimilarTags } from '../../src/features/tags/tagUtils';
import { newDocId } from '../../src/lib/id';
import { makeBook, makeNote, makeTag } from './helpers';

const books = new Set(['b1']);

describe('parsePage', () => {
  it('1以上の整数のみ。空欄は null', () => {
    expect(parsePage('70')).toBe(70);
    expect(parsePage('７０')).toBe(70);
    expect(parsePage(' ')).toBeNull();
    expect(parsePage('0')).toBeUndefined();
    expect(parsePage('70.5')).toBeUndefined();
    expect(parsePage('100001')).toBeUndefined();
    expect(parsePage('p70')).toBeUndefined();
  });
});

describe('validateNoteDraft（要件 SCR-05 の保存条件）', () => {
  it('登録済み書籍が必要', () => {
    const r = validateNoteDraft({ ...emptyNoteDraft('zz'), quote: 'q' }, books);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.bookId).toBeTruthy();
  });

  it('引用・コメントが両方空（空白のみ含む）なら保存不可', () => {
    const r = validateNoteDraft({ ...emptyNoteDraft('b1'), quote: '  ', comment: '　' }, books);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.body).toBeTruthy();
  });

  it('引用だけ・コメントだけは保存可', () => {
    expect(validateNoteDraft({ ...emptyNoteDraft('b1'), quote: 'q' }, books).ok).toBe(true);
    expect(validateNoteDraft({ ...emptyNoteDraft('b1'), comment: 'c' }, books).ok).toBe(true);
  });

  it('ページ範囲は終了 >= 開始、終了のみは不可', () => {
    const base = { ...emptyNoteDraft('b1'), quote: 'q' };
    const bad = validateNoteDraft({ ...base, pageStart: '72', pageEnd: '70' }, books);
    expect(!bad.ok && bad.errors.pageEnd).toBeTruthy();
    const endOnly = validateNoteDraft({ ...base, pageEnd: '70' }, books);
    expect(!endOnly.ok && endOnly.errors.pageEnd).toBeTruthy();
    const ok = validateNoteDraft({ ...base, pageStart: '70', pageEnd: '72' }, books);
    expect(ok.ok && ok.input).toMatchObject({ pageStart: 70, pageEnd: 72 });
  });

  it('新規タグを分離し、ID 参照で保存する', () => {
    const r = validateNoteDraft(
      {
        ...emptyNoteDraft('b1'),
        quote: ' 引用 ',
        topicTags: [
          { id: 't1', name: '教育', isNew: false },
          { id: 'tNew', name: 'ペダゴジー', isNew: true },
        ],
        usageTags: [{ id: 'u1', name: '授業', isNew: false }],
        usageStatus: 'planned',
      },
      books,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input).toMatchObject({ quote: '引用', topicTagIds: ['t1', 'tNew'], usageTagIds: ['u1'], inputMethod: 'manual' });
      expect(r.newTags).toEqual([{ id: 'tNew', name: 'ペダゴジー', normalizedName: 'ぺだごじー', category: 'topic' }]);
    }
  });
});

describe('findSimilarTags', () => {
  const tags = [makeTag({ id: 't1', name: '教育', normalizedName: '教育' }), makeTag({ id: 't2', name: '教育学', normalizedName: '教育学' }), makeTag({ id: 'u1', name: '教育', normalizedName: '教育', category: 'usage' })];
  it('同じカテゴリで正規化後に一致するタグを「同一」、包含関係を「類似」とする', () => {
    const r = findSimilarTags(tags, ' 教育 ', 'topic');
    expect(r.same?.id).toBe('t1');
    expect(r.similar.map((t) => t.id)).toEqual(['t2']);
    expect(findSimilarTags(tags, '哲学', 'topic').same).toBeUndefined();
  });
});

describe('searchNotes', () => {
  const book1 = makeBook({ id: 'b1', title: '静かな読書の技法', titleNormalized: '静かな読書の技法', authors: ['霧島透'] });
  const book2 = makeBook({ id: 'b2', title: 'アイデアの余白', titleNormalized: 'あいであの余白', authors: ['山田'] });
  const booksById = new Map([book1, book2].map((b) => [b.id, b]));
  const tag = makeTag({ id: 't1', name: 'デザイン', normalizedName: 'でざいん' });
  const tagsById = new Map([[tag.id, tag]]);
  const at = (d: string) => Timestamp.fromDate(new Date(d));
  const notes = [
    makeNote({ id: 'n1', bookId: 'b1', pageStart: 70, quote: '読みかけの本…', comment: '授業の参考', usageStatus: 'planned', createdAt: at('2026-10-01T09:00'), updatedAt: at('2026-10-25T09:00') }),
    makeNote({ id: 'n2', bookId: 'b2', pageStart: 42, quote: '', comment: '思いつきを書き留める', topicTagIds: ['t1'], usageStatus: 'used', createdAt: at('2026-10-10T09:00'), updatedAt: at('2026-10-11T09:00') }),
    makeNote({ id: 'n3', bookId: 'b1', pageStart: 12, quote: '序章', comment: '', usageStatus: 'unassigned', createdAt: at('2026-10-20T09:00'), updatedAt: at('2026-10-21T09:00') }),
  ];
  const run = (over: Partial<typeof emptyFilter>) => searchNotes(notes, { ...emptyFilter, ...over }, booksById, tagsById).map((n) => n.id);

  it('引用・コメント・書名・著者・タグ名を検索し、表記揺れを吸収する', () => {
    expect(run({ query: '読みかけ' })).toEqual(['n1']);
    expect(run({ query: 'アイデア' })).toEqual(['n2']);
    expect(run({ query: 'とまの' })).toEqual([]);
    expect(run({ query: '霧島' })).toEqual(['n1', 'n3']);
    expect(run({ query: 'でざいん' })).toEqual(['n2']);
    expect(run({ query: '霧島 序章' })).toEqual(['n3']);
  });

  it('書籍・タグ・活用状態・作成日で絞り込む', () => {
    expect(run({ bookId: 'b1' })).toEqual(['n1', 'n3']);
    expect(run({ topicTagId: 't1' })).toEqual(['n2']);
    expect(run({ usageStatus: 'used' })).toEqual(['n2']);
    expect(run({ dateFrom: '2026-10-05', dateTo: '2026-10-15' })).toEqual(['n2']);
  });

  it('更新日順・作成日順・書籍ごとのページ順', () => {
    expect(run({})).toEqual(['n1', 'n3', 'n2']);
    expect(run({ sort: 'created' })).toEqual(['n3', 'n2', 'n1']);
    // 書名（正規化）順 → ページ順: あいであの余白(b2) → 静かな読書の技法(b1: p12, p70)
    expect(run({ sort: 'bookPage' })).toEqual(['n2', 'n3', 'n1']);
  });

  it('見出しとページ表記', () => {
    expect(noteHeadline({ quote: '', comment: '一行目\n二行目' })).toBe('一行目');
    expect(formatPages({ pageStart: 70, pageEnd: 72 })).toBe('p.70–72');
    expect(formatPages({ pageStart: 70, pageEnd: null })).toBe('p.70');
    expect(formatPages({ pageStart: null, pageEnd: null })).toBeNull();
  });
});

describe('newDocId', () => {
  it('Firestore の自動IDと同じ20文字の英数字', () => {
    const ids = new Set(Array.from({ length: 200 }, newDocId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9]{20}$/);
  });
});
