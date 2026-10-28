import { copy } from '../../app/copy';
import { APP_NAME } from '../../app/config';
import type { BookRecord } from '../../services/firebase/books';
import type { NoteRecord } from '../../services/firebase/notes';
import type { TagRecord } from '../../services/firebase/tags';
import { formatDateTime } from '../../lib/date';
import { formatPages } from '../notes/noteSearch';

/**
 * Markdown エクスポート（要件 FR-DATA: メモ単位・書籍単位。引用には書名とページを併記する）。
 * 読みやすさ用の書き出しで、復元には JSON を使う。
 */

const md = copy.backup.markdown;
const heading = (level: number, text: string) => `${'#'.repeat(level)} ${text.replace(/\s*\n\s*/g, ' ')}`;
const blockquote = (text: string) =>
  text
    .split('\n')
    .map((line) => (line.trim() ? `> ${line}` : '>'))
    .join('\n');

/** 引用の出典表記: — 『書名』p.70 */
export function citation(book: Pick<BookRecord, 'title'> | undefined, note: Pick<NoteRecord, 'pageStart' | 'pageEnd'>): string {
  return `— 『${book?.title ?? md.unknownBook}』${formatPages(note) ?? ''}`;
}

function bookByline(book: BookRecord): string[] {
  return [
    book.authors.length > 0 ? `${md.authors}: ${book.authors.join('、')}` : null,
    book.publisher ? `${md.publisher}: ${book.publisher}` : null,
    book.isbn13 ? `ISBN: ${book.isbn13}` : null,
  ].filter((s) => s !== null);
}

/** 1件のメモ。level はメモ見出しの階層 */
export function noteSection(note: NoteRecord, book: BookRecord | undefined, tagsById: ReadonlyMap<string, TagRecord>, level: number): string {
  const tagNames = (ids: string[]) =>
    ids
      .map((id) => tagsById.get(id)?.name)
      .filter((n) => n !== undefined)
      .map((n) => `#${n}`)
      .join(' ');
  const topic = tagNames(note.topicTagIds);
  const usage = tagNames(note.usageTagIds);
  const meta = [
    topic ? `- ${md.topic}: ${topic}` : null,
    usage ? `- ${md.usage}: ${usage}` : null,
    note.usageStatus !== 'unassigned' ? `- ${md.status}: ${copy.noteForm.status[note.usageStatus]}` : null,
    `- ${md.recorded}: ${formatDateTime(note.createdAt)}`,
  ].filter((s) => s !== null);

  const parts = [heading(level, formatPages(note) ?? md.noPage)];
  if (note.quote.trim()) parts.push(`${blockquote(note.quote.trim())}\n>\n> ${citation(book, note)}`);
  if (note.comment.trim()) parts.push(note.comment.trim());
  parts.push(meta.join('\n'));
  return parts.join('\n\n');
}

/** ページ順（ページなしは最後）、同じページは作成順 */
export function sortByPage(notes: readonly NoteRecord[]): NoteRecord[] {
  const created = (n: NoteRecord) => n.createdAt?.toMillis?.() ?? 0;
  return [...notes].sort((a, b) => (a.pageStart ?? Infinity) - (b.pageStart ?? Infinity) || created(a) - created(b));
}

export function noteToMarkdown(note: NoteRecord, book: BookRecord | undefined, tagsById: ReadonlyMap<string, TagRecord>): string {
  const head = [heading(1, `『${book?.title ?? md.unknownBook}』`), ...(book ? bookByline(book) : [])].join('\n\n');
  return `${head}\n\n${noteSection(note, book, tagsById, 2)}\n`;
}

function bookBlock(book: BookRecord, notes: readonly NoteRecord[], tagsById: ReadonlyMap<string, TagRecord>, level: number): string {
  const sorted = sortByPage(notes);
  const parts = [heading(level, `『${book.title}』`), ...bookByline(book), md.count(sorted.length)];
  for (const n of sorted) parts.push(noteSection(n, book, tagsById, level + 1));
  return parts.join('\n\n');
}

export function bookToMarkdown(book: BookRecord, notes: readonly NoteRecord[], tagsById: ReadonlyMap<string, TagRecord>): string {
  return `${bookBlock(book, notes.filter((n) => n.bookId === book.id), tagsById, 1)}\n`;
}

/** すべてのメモを本ごとにまとめる（メモのない本は含めない） */
export function allToMarkdown(
  books: readonly BookRecord[],
  notes: readonly NoteRecord[],
  tagsById: ReadonlyMap<string, TagRecord>,
  now = new Date(),
): string {
  const byBook = new Map<string, NoteRecord[]>();
  for (const n of notes) byBook.set(n.bookId, [...(byBook.get(n.bookId) ?? []), n]);
  const withNotes = [...books].filter((b) => byBook.has(b.id)).sort((a, b) => a.title.localeCompare(b.title, 'ja'));
  const parts = [heading(1, md.allTitle(APP_NAME)), md.exportedAt(formatDateTime({ toDate: () => now }))];
  for (const b of withNotes) parts.push(bookBlock(b, byBook.get(b.id)!, tagsById, 2));
  return `${parts.join('\n\n')}\n`;
}
