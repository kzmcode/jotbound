import { CONTEXT_LIMITS, type ExtractedMemo, type ExtractionInput } from '../../services/ai/types';
import type { BookRecord } from '../../services/firebase/books';
import type { NoteRecord } from '../../services/firebase/notes';
import type { TagRecord } from '../../services/firebase/tags';
import type { TagCategory } from '../../types/models';
import { normalizeTitle } from '../books/bookUtils';
import type { NoteDraft, TagChoice } from '../notes/noteDraft';
import { normalizeTagName } from '../tags/tagUtils';

export type BookMatch =
  | { kind: 'noMention' }
  /** 書名・別名が正規化後に一致（exact）または部分一致（partial）で1冊に決まった */
  | { kind: 'exact' | 'partial'; bookId: string }
  /** 複数の候補があり、人が選ぶ必要がある */
  | { kind: 'ambiguous'; bookIds: string[] }
  | { kind: 'none' };

const MIN_PARTIAL = 2;

/**
 * bookMention から登録済みの本を探す（要件 FR-AI: 書名正規化・別名・部分一致）。
 * 一意に決まらない場合は ambiguous / none を返し、自動で決めない。
 */
export function matchBook(mention: string | null, books: readonly BookRecord[]): BookMatch {
  const key = mention ? normalizeTitle(mention) : '';
  if (!key) return { kind: 'noMention' };
  const names = (b: BookRecord) => [b.titleNormalized || normalizeTitle(b.title), ...b.aliases.map(normalizeTitle)].filter(Boolean);

  const exact = books.filter((b) => names(b).includes(key));
  if (exact.length === 1) return { kind: 'exact', bookId: exact[0]!.id };
  if (exact.length > 1) return { kind: 'ambiguous', bookIds: exact.map((b) => b.id) };

  const partial = books.filter((b) =>
    names(b).some((n) => (key.length >= MIN_PARTIAL && n.includes(key)) || (n.length >= MIN_PARTIAL && key.includes(n))),
  );
  if (partial.length === 1) return { kind: 'partial', bookId: partial[0]!.id };
  if (partial.length > 1) return { kind: 'ambiguous', bookIds: partial.map((b) => b.id) };
  return { kind: 'none' };
}

/**
 * AI のタグ候補を既存タグに対応付ける（既存タグを優先）。
 * 既存に一致しない候補は proposals として返し、利用者が選んだときだけ新規タグになる（FR-TAG）。
 */
export function matchTags(candidates: readonly string[], tags: readonly TagRecord[], category: TagCategory) {
  const selected: TagChoice[] = [];
  const proposals: string[] = [];
  for (const name of candidates) {
    const key = normalizeTagName(name);
    if (!key) continue;
    const same = tags.find((t) => t.category === category && t.normalizedName === key);
    if (same) {
      if (!selected.some((s) => s.id === same.id)) selected.push({ id: same.id, name: same.name, isNew: false });
    } else if (!proposals.some((p) => normalizeTagName(p) === key)) {
      proposals.push(name);
    }
  }
  return { selected, proposals };
}

export type ExtractionReview = {
  form: NoteDraft;
  bookMatch: BookMatch;
  /** 発話の書名が録音時に選んでいた本と異なる */
  bookDiffersFromSelected: boolean;
  proposals: Record<TagCategory, string[]>;
};

/** 抽出結果から確認フォームの初期値を作る。保存は利用者が確認してから行う */
export function reviewFromExtraction(
  memo: ExtractedMemo,
  books: readonly BookRecord[],
  tags: readonly TagRecord[],
  selectedBookId: string | null,
): ExtractionReview {
  const bookMatch = matchBook(memo.bookMention, books);
  const known = (id: string | null) => (id && books.some((b) => b.id === id) ? id : '');
  let bookId = '';
  if (bookMatch.kind === 'exact' || bookMatch.kind === 'partial') bookId = bookMatch.bookId;
  // 書名が話されなかったときだけ、録音時に選んでいた本を使う
  else if (bookMatch.kind === 'noMention') bookId = known(selectedBookId);

  const topic = matchTags(memo.topicTagCandidates, tags, 'topic');
  const usage = matchTags(memo.usageTagCandidates, tags, 'usage');
  return {
    bookMatch,
    bookDiffersFromSelected: Boolean(bookId && known(selectedBookId) && bookId !== selectedBookId),
    proposals: { topic: topic.proposals, usage: usage.proposals },
    form: {
      bookId,
      pageStart: memo.pageStart?.toString() ?? '',
      pageEnd: memo.pageEnd?.toString() ?? '',
      quote: memo.quote,
      comment: memo.comment,
      topicTags: topic.selected,
      usageTags: usage.selected,
      usageStatus: memo.usageStatus,
      transcript: memo.transcript || null,
      inputMethod: 'voice',
    },
  };
}

const millis = (t: { toMillis?: () => number } | null | undefined) => t?.toMillis?.() ?? 0;

/**
 * AI に渡す補助文脈（件数を制限）。選択中の本 → 読書中 → 最近メモした本 → 最近更新した本の順。
 * タグは使用回数の多い順。
 */
export function extractionContext(
  books: readonly BookRecord[],
  notes: readonly NoteRecord[],
  tags: readonly TagRecord[],
  selectedBookId: string | null,
): Pick<ExtractionInput, 'candidateBooks' | 'existingTags'> {
  const lastNoted = new Map<string, number>();
  const tagUse = new Map<string, number>();
  for (const n of notes) {
    lastNoted.set(n.bookId, Math.max(lastNoted.get(n.bookId) ?? 0, millis(n.updatedAt)));
    for (const id of [...n.topicTagIds, ...n.usageTagIds]) tagUse.set(id, (tagUse.get(id) ?? 0) + 1);
  }
  const rank = (b: BookRecord) => (b.id === selectedBookId ? 3 : b.readingStatus === 'reading' ? 2 : lastNoted.has(b.id) ? 1 : 0);
  const candidateBooks = [...books]
    .sort((a, b) => rank(b) - rank(a) || (lastNoted.get(b.id) ?? 0) - (lastNoted.get(a.id) ?? 0) || millis(b.updatedAt) - millis(a.updatedAt))
    .slice(0, CONTEXT_LIMITS.books)
    .map((b) => ({ id: b.id, title: b.title }));
  const existingTags = (['topic', 'usage'] as const).flatMap((category) =>
    tags
      .filter((t) => t.category === category)
      .sort((a, b) => (tagUse.get(b.id) ?? 0) - (tagUse.get(a.id) ?? 0))
      .slice(0, CONTEXT_LIMITS.tagsPerCategory)
      .map((t) => ({ id: t.id, name: t.name, category })),
  );
  return { candidateBooks, existingTags };
}
