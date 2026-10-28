import { normalizeText } from '../../lib/text';
import { LIMITS } from '../../types/models';

/** Google Books 由来の本なら書籍ページの URL を返す（ブランディング規約のリンク）。 */
export function googleBooksUrl(externalSourceId: string | null): string | null {
  const id = externalSourceId?.match(/^google:([\w-]+)$/)?.[1];
  return id ? `https://books.google.com/books?id=${id}` : null;
}

/** 書名の正規化（照合・重複検出用）。src/lib/text.ts の正規化に上限長を加えたもの。 */
export function normalizeTitle(title: string): string {
  return normalizeText(title).slice(0, LIMITS.titleMax);
}

function isbn13CheckDigit(first12: string): number {
  const sum = [...first12].reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

export function isValidIsbn13(isbn: string): boolean {
  return /^97[89]\d{10}$/.test(isbn) && isbn13CheckDigit(isbn.slice(0, 12)) === Number(isbn[12]);
}

function isValidIsbn10(isbn: string): boolean {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  const sum = [...isbn].reduce((acc, c, i) => acc + (c === 'X' ? 10 : Number(c)) * (10 - i), 0);
  return sum % 11 === 0;
}

/** ISBN-10/13（ハイフン・空白可）を検証して ISBN-13 に揃える。不正なら null。 */
export function normalizeIsbn(input: string): string | null {
  const s = input.normalize('NFKC').toUpperCase().replace(/[\s-]/g, '');
  if (isValidIsbn13(s)) return s;
  if (isValidIsbn10(s)) {
    const first12 = `978${s.slice(0, 9)}`;
    return `${first12}${isbn13CheckDigit(first12)}`;
  }
  return null;
}

/** 「、」「,」改行区切りの入力を配列に（空要素・重複を除く） */
export function splitList(input: string, max: number): string[] {
  const items = input
    .split(/[,，、\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(items)].slice(0, max);
}

const TRUSTED_COVER = /^https:\/\/(books\.google\.com|books\.googleusercontent\.com|covers\.openlibrary\.org)\//;

/** 書影は信頼できる提供元の https のみ表示・保存する（要件 5-9、firestore.rules と同じ条件） */
export function isTrustedCoverUrl(url: string | null | undefined): url is string {
  return typeof url === 'string' && url.length <= LIMITS.coverUrlMax && TRUSTED_COVER.test(url);
}

export function openLibraryCoverUrl(isbn13: string): string {
  return `https://covers.openlibrary.org/b/isbn/${isbn13}-M.jpg?default=false`;
}

export type DuplicateCandidate = { id: string; title: string; isbn13: string | null };

/** 同じISBN、または正規化した書名が一致する登録済みの本（同名異版は確認のうえ登録可） */
export function findPossibleDuplicates<T extends DuplicateCandidate>(
  books: readonly T[],
  draft: { title: string; isbn13: string | null },
  excludeId?: string,
): T[] {
  const key = normalizeTitle(draft.title);
  return books.filter(
    (b) => b.id !== excludeId && ((draft.isbn13 && b.isbn13 === draft.isbn13) || normalizeTitle(b.title) === key),
  );
}
