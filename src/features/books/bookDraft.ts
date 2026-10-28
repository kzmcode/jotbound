import { copy } from '../../app/copy';
import type { BookInput } from '../../services/firebase/books';
import { LIMITS, type CoverProvider, type ReadingStatus } from '../../types/models';
import { isTrustedCoverUrl, normalizeIsbn, normalizeTitle, splitList } from './bookUtils';

/** フォームの入力状態（文字列のまま保持し、保存時に検証・変換する） */
export type BookDraft = {
  title: string;
  authors: string;
  isbn: string;
  publisher: string;
  readingStatus: ReadingStatus;
  aliases: string;
  coverUrl: string | null;
  coverProvider: CoverProvider;
  externalSourceId: string | null;
};

export type BookDraftErrors = Partial<Record<'title' | 'isbn' | 'publisher' | 'authors' | 'aliases', string>>;

export const emptyDraft: BookDraft = {
  title: '',
  authors: '',
  isbn: '',
  publisher: '',
  readingStatus: 'unread',
  aliases: '',
  coverUrl: null,
  coverProvider: 'none',
  externalSourceId: null,
};

export function draftFromBook(b: BookInput): BookDraft {
  return {
    title: b.title,
    authors: b.authors.join('、'),
    isbn: b.isbn13 ?? '',
    publisher: b.publisher ?? '',
    readingStatus: b.readingStatus,
    aliases: b.aliases.join('、'),
    coverUrl: b.coverUrl,
    coverProvider: b.coverProvider,
    externalSourceId: b.externalSourceId,
  };
}

const tooLong = (list: string[], max: number) => list.some((s) => s.length > max);

/** 検証して Firestore に保存する形へ変換する（firestore.rules と同じ制約） */
export function validateDraft(d: BookDraft): { ok: true; input: BookInput } | { ok: false; errors: BookDraftErrors } {
  const errors: BookDraftErrors = {};
  const title = d.title.trim();
  if (!title) errors.title = copy.books.titleRequired;
  else if (title.length > LIMITS.titleMax) errors.title = copy.books.titleTooLong;

  const isbnText = d.isbn.trim();
  const isbn13 = isbnText ? normalizeIsbn(isbnText) : null;
  if (isbnText && !isbn13) errors.isbn = copy.books.invalidIsbn;

  const publisher = d.publisher.trim();
  if (publisher.length > LIMITS.publisherMax) errors.publisher = copy.books.tooLong(LIMITS.publisherMax);

  const authors = splitList(d.authors, LIMITS.authorsMax);
  if (tooLong(authors, LIMITS.titleMax)) errors.authors = copy.books.tooLong(LIMITS.titleMax);
  const aliases = splitList(d.aliases, LIMITS.aliasesMax);
  if (tooLong(aliases, LIMITS.titleMax)) errors.aliases = copy.books.tooLong(LIMITS.titleMax);

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const trustedCover = isTrustedCoverUrl(d.coverUrl) && d.coverProvider !== 'none';
  return {
    ok: true,
    input: {
      title,
      titleNormalized: normalizeTitle(title) || title.slice(0, LIMITS.titleMax),
      aliases,
      authors,
      isbn13,
      publisher: publisher || null,
      coverUrl: trustedCover ? d.coverUrl : null,
      coverProvider: trustedCover ? d.coverProvider : 'none',
      externalSourceId: d.externalSourceId?.slice(0, 200) ?? null,
      readingStatus: d.readingStatus,
    },
  };
}
