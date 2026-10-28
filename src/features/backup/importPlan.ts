import { z } from 'zod';
import type { BookRecord } from '../../services/firebase/books';
import type { TagRecord } from '../../services/firebase/tags';
import { LIMITS, type Book, type Note, type Tag, type TagCategory } from '../../types/models';
import { isTrustedCoverUrl, normalizeTitle } from '../books/bookUtils';
import { normalizeTagName } from '../tags/tagUtils';
import { BACKUP_FORMAT, BACKUP_VERSION, LEGACY_BACKUP_FORMATS } from './backupFormat';

/**
 * JSON インポートの検証と計画づくり（要件 FR-DATA）。書き込みはせず、プレビューに出す内容と
 * 書き込む文書を決める。各項目は Security Rules と同じ条件で検証し、満たさないものは取り込まずに理由を示す。
 * このモジュールは Zod を含むため、設定画面から動的 import で読み込む。
 */

export type DuplicatePolicy = 'skip' | 'update';
export type InvalidReason = 'format' | 'duplicateId' | 'missingBook' | 'body' | 'pages';
export type InvalidItem = { kind: 'book' | 'tag' | 'note'; id: string | null; reason: InvalidReason };

type BookData = Omit<Book, 'createdAt' | 'updatedAt'>;
type TagData = Omit<Tag, 'createdAt' | 'updatedAt'>;
type NoteData = Omit<Note, 'createdAt' | 'updatedAt' | 'schemaVersion'>;
/** create は createdAt を引き継ぐ（null ならサーバー時刻）。update は既存の createdAt を変えない */
export type PlannedWrite<T> = { id: string; mode: 'create' | 'update'; data: T; createdAt: Date | null };

export type ImportPlan = {
  exportedAt: string | null;
  books: PlannedWrite<BookData>[];
  tags: PlannedWrite<TagData>[];
  notes: PlannedWrite<NoteData>[];
  counts: Record<'books' | 'tags' | 'notes', { create: number; update: number; skip: number }>;
  /** 同じ名前の既存タグに統合した数（新しいタグを作らない） */
  mergedTags: number;
  /** 見つからないタグを外した参照の数 */
  droppedTagRefs: number;
  /** 別IDだが同じ書名または ISBN の本が既にある（別の本として追加する） */
  similarBooks: string[];
  invalid: InvalidItem[];
  preferredBookId: string | null;
};

export type ExistingData = {
  books: readonly Pick<BookRecord, 'id' | 'title' | 'isbn13'>[];
  tags: readonly Pick<TagRecord, 'id' | 'normalizedName' | 'category'>[];
  noteIds: ReadonlySet<string>;
};

export class BackupFileError extends Error {
  constructor(readonly reason: 'json' | 'format' | 'version') {
    super(reason);
    this.name = 'BackupFileError';
  }
}

// Firestore の文書IDとして使える文字列（"/" を含まない、"." ".." "__…__" 以外）
const docId = z
  .string()
  .min(1)
  .max(LIMITS.idMax)
  .regex(/^(?!\.\.?$)(?!__.*__$)[^/]+$/);
const time = z.string().nullable().optional();
const nullableStr = z.string().nullable().optional();

const envelopeSchema = z.object({
  format: z.string(),
  version: z.number(),
  exportedAt: z.string().nullable().optional(),
  settings: z.object({ preferredBookId: z.string().nullable().optional() }).partial().nullable().optional(),
  books: z.array(z.unknown()).default([]),
  tags: z.array(z.unknown()).default([]),
  notes: z.array(z.unknown()).default([]),
});

const bookSchema = z.object({
  id: docId,
  title: z.string(),
  aliases: z.array(z.string()).default([]),
  authors: z.array(z.string()).default([]),
  isbn13: nullableStr,
  publisher: nullableStr,
  coverUrl: nullableStr,
  coverProvider: z.enum(['google', 'openlibrary', 'manual', 'none']).default('none'),
  externalSourceId: nullableStr,
  readingStatus: z.enum(['unread', 'reading', 'finished']).default('unread'),
  createdAt: time,
});

const tagSchema = z.object({
  id: docId,
  name: z.string(),
  category: z.enum(['topic', 'usage']),
  createdAt: time,
});

const page = z.number().int().min(1).max(LIMITS.pageMax).nullable().default(null);
const noteSchema = z.object({
  id: docId,
  bookId: docId,
  pageStart: page,
  pageEnd: page,
  quote: z.string().max(LIMITS.quoteMax).default(''),
  comment: z.string().max(LIMITS.commentMax).default(''),
  transcript: z.string().max(LIMITS.transcriptMax).nullable().default(null),
  topicTagIds: z.array(z.string()).default([]),
  usageTagIds: z.array(z.string()).default([]),
  usageStatus: z.enum(['unassigned', 'planned', 'used']).default('unassigned'),
  inputMethod: z.enum(['voice', 'manual']).default('manual'),
  createdAt: time,
});

// firestore.rules の hasText と同じ（全角スペース・ノーブレークスペースも空白とみなす）
const hasText = (s: string) => /[^\s\u3000\u00a0]/.test(s);
const clip = (s: string | null | undefined, max: number) => {
  const v = (s ?? '').trim().slice(0, max);
  return v || null;
};
const list = (items: string[], max: number, itemMax: number) =>
  [...new Set(items.map((s) => s.trim().slice(0, itemMax)).filter(Boolean))].slice(0, max);

/** Rules は createdAt が現在以前であることを求める。未来・不正な値はサーバー時刻にする */
function pastDate(value: string | null | undefined, now: Date): Date | null {
  if (!value) return null;
  const d = new Date(value);
  const t = d.getTime();
  return Number.isNaN(t) || t > now.getTime() - 60_000 ? null : d;
}

/** ファイルを読み、外枠（形式・版）を確かめる。中身の各項目は planImport で検証する */
export function readBackup(text: string) {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupFileError('json');
  }
  const parsed = envelopeSchema.safeParse(json);
  if (!parsed.success || parsed.data.format !== BACKUP_FORMAT && !LEGACY_BACKUP_FORMATS.includes(parsed.data.format)) throw new BackupFileError('format');
  if (parsed.data.version > BACKUP_VERSION) throw new BackupFileError('version');
  return parsed.data;
}

export type BackupEnvelope = ReturnType<typeof readBackup>;

export function planImport(file: BackupEnvelope, existing: ExistingData, policy: DuplicatePolicy, now = new Date()): ImportPlan {
  const invalid: InvalidItem[] = [];
  const counts = { books: { create: 0, update: 0, skip: 0 }, tags: { create: 0, update: 0, skip: 0 }, notes: { create: 0, update: 0, skip: 0 } };
  const idOf = (raw: unknown) => {
    const id = (raw as { id?: unknown } | null)?.id;
    return typeof id === 'string' ? id : null;
  };

  /** ファイル内で同じIDが2回出てきたら、2件目以降は取り込まない */
  const firstTime = (kind: InvalidItem['kind'], seen: Set<string>, id: string) => {
    if (seen.has(id)) {
      invalid.push({ kind, id, reason: 'duplicateId' });
      return false;
    }
    seen.add(id);
    return true;
  };
  /** 既存かどうかと重複方針から create / update / skip を決める */
  const modeFor = (key: keyof typeof counts, exists: boolean) => {
    const mode = exists ? (policy === 'update' ? 'update' : 'skip') : 'create';
    counts[key][mode] += 1;
    return mode;
  };

  // ---- タグ（同じ種類・同じ名前のタグが既にあれば新しく作らず、メモの参照をそちらに付け替える） ----
  const tagWrites: PlannedWrite<TagData>[] = [];
  const tagMap: Record<TagCategory, Map<string, string>> = { topic: new Map(), usage: new Map() };
  const existingTagById = new Map(existing.tags.map((t) => [t.id, t]));
  const byName = new Map(existing.tags.map((t) => [`${t.category}:${t.normalizedName}`, t.id]));
  let mergedTags = 0;
  const seenTags = new Set<string>();
  for (const raw of file.tags) {
    const r = tagSchema.safeParse(raw);
    const name = r.success ? r.data.name.trim().slice(0, LIMITS.tagNameMax) : '';
    const normalizedName = normalizeTagName(name);
    if (!r.success || !hasText(name) || !normalizedName) {
      invalid.push({ kind: 'tag', id: idOf(raw), reason: 'format' });
      continue;
    }
    const { id, category } = r.data;
    if (!firstTime('tag', seenTags, id)) continue;
    const key = `${category}:${normalizedName}`;
    const nameOwner = byName.get(key);
    const sameId = existingTagById.get(id);

    if (sameId) {
      // 既存タグは既存の種類のまま参照する。種類が違う・改名で別のタグと重複する場合は更新しない
      tagMap[sameId.category].set(id, id);
      const canUpdate = policy === 'update' && sameId.category === category && (nameOwner === undefined || nameOwner === id);
      if (!canUpdate) {
        counts.tags.skip += 1;
        continue;
      }
      counts.tags.update += 1;
      byName.delete(`${sameId.category}:${sameId.normalizedName}`);
      byName.set(key, id);
      tagWrites.push({ id, mode: 'update', data: { name, normalizedName, category }, createdAt: null });
      continue;
    }
    if (nameOwner) {
      tagMap[category].set(id, nameOwner);
      mergedTags += 1;
      continue;
    }
    modeFor('tags', false);
    tagMap[category].set(id, id);
    byName.set(key, id);
    tagWrites.push({ id, mode: 'create', data: { name, normalizedName, category }, createdAt: pastDate(r.data.createdAt, now) });
  }

  // ---- 本 ----
  const bookWrites: PlannedWrite<BookData>[] = [];
  const existingBookIds = new Set(existing.books.map((b) => b.id));
  const availableBooks = new Set(existingBookIds);
  const similarBooks: string[] = [];
  const seenBooks = new Set<string>();
  for (const raw of file.books) {
    const r = bookSchema.safeParse(raw);
    const title = r.success ? r.data.title.trim().slice(0, LIMITS.titleMax) : '';
    if (!r.success || !hasText(title)) {
      invalid.push({ kind: 'book', id: idOf(raw), reason: 'format' });
      continue;
    }
    const b = r.data;
    if (!firstTime('book', seenBooks, b.id)) continue;
    const exists = existingBookIds.has(b.id);
    const mode = modeFor('books', exists);
    availableBooks.add(b.id);
    if (mode === 'skip') continue;

    const isbn13 = b.isbn13 && /^97[89]\d{10}$/.test(b.isbn13) ? b.isbn13 : null;
    const cover = b.coverProvider !== 'none' && isTrustedCoverUrl(b.coverUrl) ? { coverUrl: b.coverUrl, coverProvider: b.coverProvider } : { coverUrl: null, coverProvider: 'none' as const };
    const titleNormalized = normalizeTitle(title) || title;
    if (!exists && existing.books.some((e) => (isbn13 && e.isbn13 === isbn13) || normalizeTitle(e.title) === titleNormalized)) {
      similarBooks.push(title);
    }
    bookWrites.push({
      id: b.id,
      mode,
      createdAt: mode === 'create' ? pastDate(b.createdAt, now) : null,
      data: {
        title,
        titleNormalized,
        aliases: list(b.aliases, LIMITS.aliasesMax, LIMITS.titleMax),
        authors: list(b.authors, LIMITS.authorsMax, LIMITS.titleMax),
        isbn13,
        publisher: clip(b.publisher, LIMITS.publisherMax),
        ...cover,
        externalSourceId: clip(b.externalSourceId, 200),
        readingStatus: b.readingStatus,
      },
    });
  }

  // ---- メモ（本が見つからないものは取り込まない。見つからないタグは外す） ----
  const noteWrites: PlannedWrite<NoteData>[] = [];
  let droppedTagRefs = 0;
  const knownTag = (category: TagCategory, id: string) => {
    const mapped = tagMap[category].get(id);
    if (mapped) return mapped;
    return existingTagById.get(id)?.category === category ? id : null;
  };
  const resolveTags = (category: TagCategory, ids: string[]) => {
    const out: string[] = [];
    for (const id of ids) {
      const to = knownTag(category, id);
      if (!to) droppedTagRefs += 1;
      else if (!out.includes(to)) out.push(to);
    }
    return out.slice(0, LIMITS.tagIdsMax);
  };
  const seenNotes = new Set<string>();
  for (const raw of file.notes) {
    const r = noteSchema.safeParse(raw);
    if (!r.success) {
      invalid.push({ kind: 'note', id: idOf(raw), reason: 'format' });
      continue;
    }
    const n = r.data;
    if (!firstTime('note', seenNotes, n.id)) continue;
    let reason: InvalidReason | null = null;
    if (!availableBooks.has(n.bookId)) reason = 'missingBook';
    else if (!hasText(n.quote) && !hasText(n.comment)) reason = 'body';
    else if (n.pageEnd !== null && (n.pageStart === null || n.pageEnd < n.pageStart)) reason = 'pages';
    if (reason) {
      invalid.push({ kind: 'note', id: n.id, reason });
      continue;
    }
    const mode = modeFor('notes', existing.noteIds.has(n.id));
    if (mode === 'skip') continue;
    noteWrites.push({
      id: n.id,
      mode,
      createdAt: mode === 'create' ? pastDate(n.createdAt, now) : null,
      data: {
        bookId: n.bookId,
        pageStart: n.pageStart,
        pageEnd: n.pageEnd,
        quote: n.quote,
        comment: n.comment,
        transcript: n.transcript,
        topicTagIds: resolveTags('topic', n.topicTagIds),
        usageTagIds: resolveTags('usage', n.usageTagIds),
        usageStatus: n.usageStatus,
        inputMethod: n.inputMethod,
      },
    });
  }

  const preferred = file.settings?.preferredBookId ?? null;
  return {
    exportedAt: file.exportedAt ?? null,
    books: bookWrites,
    tags: tagWrites,
    notes: noteWrites,
    counts,
    mergedTags,
    droppedTagRefs,
    similarBooks,
    invalid,
    preferredBookId: preferred && availableBooks.has(preferred) ? preferred : null,
  };
}

/** 書き込みの回数（Spark の Firestore 無料枠は1日あたりの書き込み回数に上限がある） */
export const writeCount = (plan: ImportPlan) => plan.books.length + plan.tags.length + plan.notes.length;
