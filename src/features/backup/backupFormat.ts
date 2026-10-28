import { APP_NAME } from '../../app/config';
import type { BookRecord } from '../../services/firebase/books';
import type { NoteRecord } from '../../services/firebase/notes';
import type { TagRecord } from '../../services/firebase/tags';
import { SCHEMA_VERSION, type Book, type Note, type Profile, type Tag } from '../../types/models';

/**
 * JSON バックアップの形式（要件 FR-DATA）。全書籍・メモ・タグ・設定を ID ごと書き出し、関係を保ったまま復元する。
 * 録音の下書き・音声・API キーなどの秘密情報は含めない。時刻は ISO 8601 文字列。
 */
export const BACKUP_FORMAT = 'jotbound-backup';
/** 旧アプリ名（Lumiq）の版で書き出したバックアップ。読み込みだけ受け付ける。 */
export const LEGACY_BACKUP_FORMATS: readonly string[] = ['lumiq-backup'];
export const BACKUP_VERSION = 1;

type Times = { createdAt: string | null; updatedAt: string | null };
export type BackupBook = Omit<Book, 'createdAt' | 'updatedAt'> & Times & { id: string };
export type BackupTag = Omit<Tag, 'createdAt' | 'updatedAt'> & Times & { id: string };
export type BackupNote = Omit<Note, 'createdAt' | 'updatedAt'> & Times & { id: string };

export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  schemaVersion: typeof SCHEMA_VERSION;
  exportedAt: string;
  app: { name: string; version: string };
  settings: { preferredBookId: string | null };
  books: BackupBook[];
  tags: BackupTag[];
  notes: BackupNote[];
};

const iso = (t: { toDate?: () => Date } | null | undefined) => t?.toDate?.().toISOString() ?? null;

/** 保存されているフィールドだけを明示的に書き出す（画面用に足した値を混ぜない） */
export function buildBackup(
  data: { books: readonly BookRecord[]; tags: readonly TagRecord[]; notes: readonly NoteRecord[]; profile: Profile | null },
  now = new Date(),
): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    app: { name: APP_NAME, version: __APP_VERSION__ },
    settings: { preferredBookId: data.profile?.preferredBookId ?? null },
    books: data.books.map((b) => ({
      id: b.id,
      title: b.title,
      titleNormalized: b.titleNormalized,
      aliases: b.aliases,
      authors: b.authors,
      isbn13: b.isbn13,
      publisher: b.publisher,
      coverUrl: b.coverUrl,
      coverProvider: b.coverProvider,
      externalSourceId: b.externalSourceId,
      readingStatus: b.readingStatus,
      createdAt: iso(b.createdAt),
      updatedAt: iso(b.updatedAt),
    })),
    tags: data.tags.map((t) => ({
      id: t.id,
      name: t.name,
      normalizedName: t.normalizedName,
      category: t.category,
      createdAt: iso(t.createdAt),
      updatedAt: iso(t.updatedAt),
    })),
    notes: data.notes.map((n) => ({
      id: n.id,
      bookId: n.bookId,
      pageStart: n.pageStart,
      pageEnd: n.pageEnd,
      quote: n.quote,
      comment: n.comment,
      transcript: n.transcript,
      topicTagIds: n.topicTagIds,
      usageTagIds: n.usageTagIds,
      usageStatus: n.usageStatus,
      inputMethod: n.inputMethod,
      schemaVersion: n.schemaVersion,
      createdAt: iso(n.createdAt),
      updatedAt: iso(n.updatedAt),
    })),
  };
}

const stamp = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

/** ファイル名に使えない文字を除く */
export const safeFileName = (s: string) =>
  [...s]
    .filter((c) => c.charCodeAt(0) >= 0x20 && !'\\/:*?"<>|'.includes(c))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || 'untitled';

export const backupFileName = (now = new Date()) => `jotbound-backup-${stamp(now)}.json`;
export const markdownFileName = (label: string, now = new Date()) => `jotbound-${safeFileName(label)}-${stamp(now)}.md`;
