import { Link } from 'react-router';
import { copy } from '../../app/copy';
import { MicIcon, NoteIcon } from '../../components/icons';
import { formatRelativeDate } from '../../lib/date';
import type { BookRecord } from '../../services/firebase/books';
import type { NoteRecord } from '../../services/firebase/notes';
import type { TagRecord } from '../../services/firebase/tags';
import { formatPages, noteHeadline } from './noteSearch';

/** メモ一覧の1行。行全体がリンクで、主役は内容のテキスト（デザイン 6.3）。 */
export function NoteListItem({
  note,
  book,
  tagsById,
  showBook = true,
}: {
  note: NoteRecord;
  book: BookRecord | undefined;
  tagsById: ReadonlyMap<string, TagRecord>;
  showBook?: boolean;
}) {
  const tagNames = [...note.topicTagIds, ...note.usageTagIds].map((id) => tagsById.get(id)?.name).filter(Boolean);
  const pages = formatPages(note);
  const meta = [showBook ? (book?.title ?? copy.notes.unknownBook) : null, pages, formatRelativeDate(note.createdAt)].filter(Boolean);
  const sub = note.quote && note.comment ? note.comment : null;
  return (
    <Link
      to={`/notes/${note.id}`}
      className="flex min-h-16 items-start gap-3 rounded-md px-1 py-3 text-text no-underline transition-colors duration-[160ms] hover:bg-surface-subtle"
    >
      <span
        className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-sm bg-halo-outer text-accent-strong"
        title={note.inputMethod === 'voice' ? copy.notes.voice : copy.notes.manual}
      >
        {note.inputMethod === 'voice' ? <MicIcon size={18} /> : <NoteIcon size={18} />}
        <span className="sr-only">{note.inputMethod === 'voice' ? copy.notes.voice : copy.notes.manual}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-[15px] font-semibold leading-snug">
          {noteHeadline(note, 80)}
        </span>
        {sub && <span className="mt-0.5 line-clamp-1 block text-[13px] text-text-secondary">{sub}</span>}
        <span className="mt-1 block truncate text-[12px] text-text-secondary">{meta.join(' · ')}</span>
        {tagNames.length > 0 && (
          <span className="mt-1.5 flex flex-wrap gap-1">
            {tagNames.slice(0, 4).map((n) => (
              <span key={n} className="rounded-pill bg-surface-subtle px-2 py-0.5 text-[11px] text-text-secondary">
                #{n}
              </span>
            ))}
          </span>
        )}
      </span>
    </Link>
  );
}
