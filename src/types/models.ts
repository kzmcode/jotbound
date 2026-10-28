import type { Timestamp } from 'firebase/firestore';
import type { AI_MODEL } from '../app/config';

/** 要件定義書 4章 Firestore データ設計。users/{uid}/ 以下に保存する。 */

export const SCHEMA_VERSION = 1;

export type ReadingStatus = 'unread' | 'reading' | 'finished';
export type CoverProvider = 'google' | 'openlibrary' | 'manual' | 'none';
export type UsageStatus = 'unassigned' | 'planned' | 'used';
export type TagCategory = 'topic' | 'usage';
export type InputMethod = 'voice' | 'manual';

/** books/{bookId}（書籍IDは Firestore の文書ID。書名を主キーにしない） */
export interface Book {
  title: string;
  titleNormalized: string;
  aliases: string[];
  authors: string[];
  isbn13: string | null;
  publisher: string | null;
  coverUrl: string | null;
  coverProvider: CoverProvider;
  externalSourceId: string | null;
  readingStatus: ReadingStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** notes/{noteId}（noteId は端末で生成した固定IDで冪等に保存する） */
export interface Note {
  bookId: string;
  pageStart: number | null;
  pageEnd: number | null;
  quote: string;
  comment: string;
  transcript: string | null;
  topicTagIds: string[];
  usageTagIds: string[];
  usageStatus: UsageStatus;
  inputMethod: InputMethod;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  schemaVersion: typeof SCHEMA_VERSION;
}

/** tags/{tagId} */
export interface Tag {
  name: string;
  normalizedName: string;
  category: TagCategory;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** settings/profile */
export interface Profile {
  preferredModel: typeof AI_MODEL;
  preferredBookId: string | null;
  schemaVersion: typeof SCHEMA_VERSION;
  updatedAt: Timestamp;
}

/** Security Rules と同じ上限値（firestore.rules と一致させる） */
export const LIMITS = {
  titleMax: 200,
  aliasesMax: 10,
  authorsMax: 20,
  publisherMax: 200,
  coverUrlMax: 2000,
  pageMax: 100000,
  quoteMax: 5000,
  commentMax: 5000,
  transcriptMax: 20000,
  tagIdsMax: 10,
  tagNameMax: 50,
  idMax: 128,
} as const;
