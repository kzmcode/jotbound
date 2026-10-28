import { normalizeText } from '../../lib/text';
import type { BookRecord } from '../../services/firebase/books';
import type { NoteRecord } from '../../services/firebase/notes';
import type { TagRecord } from '../../services/firebase/tags';
import type { UsageStatus } from '../../types/models';

export type NoteSort = 'updated' | 'created' | 'bookPage';

export type NoteFilter = {
  query: string;
  bookId: string;
  topicTagId: string;
  usageTagId: string;
  usageStatus: '' | UsageStatus;
  /** 作成日（YYYY-MM-DD、端末のタイムゾーン）で絞り込む */
  dateFrom: string;
  dateTo: string;
  sort: NoteSort;
};

export const emptyFilter: NoteFilter = {
  query: '',
  bookId: '',
  topicTagId: '',
  usageTagId: '',
  usageStatus: '',
  dateFrom: '',
  dateTo: '',
  sort: 'updated',
};

export const isFiltering = (f: NoteFilter) =>
  Boolean(f.query.trim() || f.bookId || f.topicTagId || f.usageTagId || f.usageStatus || f.dateFrom || f.dateTo);

const millis = (t: { toMillis(): number } | null | undefined) => t?.toMillis() ?? 0;

function localDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 端末内の全文検索・絞り込み・並べ替え（要件 SCR-06: 全文検索サービスは使わない）。
 * 検索対象: 引用・コメント・書名・著者・タグ名。
 */
export function searchNotes(
  notes: readonly NoteRecord[],
  filter: NoteFilter,
  booksById: ReadonlyMap<string, BookRecord>,
  tagsById: ReadonlyMap<string, TagRecord>,
): NoteRecord[] {
  const terms = filter.query
    .split(/[\s\u3000]+/)
    .map(normalizeText)
    .filter(Boolean);

  const matched = notes.filter((n) => {
    if (filter.bookId && n.bookId !== filter.bookId) return false;
    if (filter.topicTagId && !n.topicTagIds.includes(filter.topicTagId)) return false;
    if (filter.usageTagId && !n.usageTagIds.includes(filter.usageTagId)) return false;
    if (filter.usageStatus && n.usageStatus !== filter.usageStatus) return false;
    if (filter.dateFrom || filter.dateTo) {
      const day = localDate(millis(n.createdAt));
      if (filter.dateFrom && day < filter.dateFrom) return false;
      if (filter.dateTo && day > filter.dateTo) return false;
    }
    if (terms.length === 0) return true;
    const book = booksById.get(n.bookId);
    const haystack = normalizeText(
      [
        n.quote,
        n.comment,
        book?.title ?? '',
        ...(book?.authors ?? []),
        ...[...n.topicTagIds, ...n.usageTagIds].map((id) => tagsById.get(id)?.name ?? ''),
      ].join(' '),
    );
    // すべての語を含む（AND 検索）
    return terms.every((t) => haystack.includes(t));
  });

  const byUpdated = (a: NoteRecord, b: NoteRecord) => millis(b.updatedAt) - millis(a.updatedAt);
  const byCreated = (a: NoteRecord, b: NoteRecord) => millis(b.createdAt) - millis(a.createdAt);
  const byBookPage = (a: NoteRecord, b: NoteRecord) => {
    const ta = booksById.get(a.bookId)?.titleNormalized ?? '';
    const tb = booksById.get(b.bookId)?.titleNormalized ?? '';
    if (ta !== tb) return ta < tb ? -1 : 1;
    const pa = a.pageStart ?? Number.MAX_SAFE_INTEGER;
    const pb = b.pageStart ?? Number.MAX_SAFE_INTEGER;
    return pa !== pb ? pa - pb : millis(a.createdAt) - millis(b.createdAt);
  };
  const compare = filter.sort === 'created' ? byCreated : filter.sort === 'bookPage' ? byBookPage : byUpdated;
  return [...matched].sort(compare);
}

/** 一覧の見出し: 引用（なければコメント）の最初の行 */
export function noteHeadline(n: Pick<NoteRecord, 'quote' | 'comment'>, max = 60): string {
  const text = (n.quote || n.comment).split('\n')[0]!.trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function formatPages(n: Pick<NoteRecord, 'pageStart' | 'pageEnd'>): string | null {
  if (n.pageStart === null) return null;
  return n.pageEnd !== null && n.pageEnd !== n.pageStart ? `p.${n.pageStart}–${n.pageEnd}` : `p.${n.pageStart}`;
}
