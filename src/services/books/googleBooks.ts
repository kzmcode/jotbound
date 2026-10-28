import type { CoverProvider } from '../../types/models';
import { isTrustedCoverUrl, normalizeIsbn } from '../../features/books/bookUtils';

/** Google Books API（公開データの検索）。https://developers.google.com/books/docs/v1/using */
const ENDPOINT = 'https://www.googleapis.com/books/v1/volumes';
const FIELDS = 'items(id,volumeInfo(title,authors,publisher,industryIdentifiers,imageLinks))';

export type BookCandidate = {
  externalSourceId: string;
  title: string;
  authors: string[];
  publisher: string | null;
  isbn13: string | null;
  coverUrl: string | null;
  coverProvider: CoverProvider;
};

export type BooksSearchErrorKind = 'notConfigured' | 'quota' | 'network' | 'http';

export class BooksSearchError extends Error {
  constructor(readonly kind: BooksSearchErrorKind) {
    super(kind);
  }
}

type Volume = {
  id: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    publisher?: string;
    industryIdentifiers?: { type: string; identifier: string }[];
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  };
};

/** Google の書影URLを https にし、装飾（edge=curl）を外す。信頼できない URL は捨てる。 */
export function toGoogleCoverUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const url = raw.replace(/^http:\/\//, 'https://').replace(/&edge=curl/, '');
  return isTrustedCoverUrl(url) ? url : null;
}

export function toCandidate(v: Volume): BookCandidate | null {
  const info = v.volumeInfo;
  const title = info?.title?.trim();
  if (!title) return null;
  const ids = info?.industryIdentifiers ?? [];
  const isbn13 =
    normalizeIsbn(ids.find((i) => i.type === 'ISBN_13')?.identifier ?? '') ??
    normalizeIsbn(ids.find((i) => i.type === 'ISBN_10')?.identifier ?? '');
  const coverUrl = toGoogleCoverUrl(info?.imageLinks?.thumbnail ?? info?.imageLinks?.smallThumbnail);
  return {
    externalSourceId: `google:${v.id}`,
    title,
    authors: info?.authors ?? [],
    publisher: info?.publisher?.trim() || null,
    isbn13,
    coverUrl,
    coverProvider: coverUrl ? 'google' : 'none',
  };
}

export async function searchGoogleBooks(
  query: { isbn: string } | { title: string },
  apiKey: string | null,
  signal?: AbortSignal,
): Promise<BookCandidate[]> {
  if (!apiKey) throw new BooksSearchError('notConfigured');
  // 2026-10 時点、intitle: 等のキーワードのみのクエリは結果が返らないため、書名は通常の検索語として送る
  const q = 'isbn' in query ? `isbn:${query.isbn}` : query.title;
  const params = new URLSearchParams({ q, maxResults: '10', printType: 'books', fields: FIELDS, key: apiKey });
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}?${params}`, { signal, referrerPolicy: 'strict-origin-when-cross-origin' });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new BooksSearchError('network');
  }
  if (res.status === 429 || res.status === 403) throw new BooksSearchError('quota');
  if (!res.ok) throw new BooksSearchError('http');
  const body = (await res.json()) as { items?: Volume[] };
  return (body.items ?? []).map(toCandidate).filter((c): c is BookCandidate => c !== null);
}
