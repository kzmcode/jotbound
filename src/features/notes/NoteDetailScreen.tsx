import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useSessionUser } from '../../app/auth';
import { copy } from '../../app/copy';
import { FlowHeader } from '../../components/layout/FlowHeader';
import { useOnline } from '../../components/layout/StatusBanners';
import { Button, ButtonLink } from '../../components/ui/Button';
import { SurfaceCard } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, Notice, Skeleton } from '../../components/ui/Feedback';
import { formatDateTime } from '../../lib/date';
import { downloadText } from '../../lib/download';
import { markdownFileName } from '../backup/backupFormat';
import { noteToMarkdown } from '../backup/markdown';
import { newDocId } from '../../lib/id';
import { BookCover } from '../books/BookCover';
import { useBooks } from '../books/BooksProvider';
import { NoteForm } from './NoteForm';
import { validateNoteDraft, type NoteDraft, type NoteDraftErrors } from './noteDraft';
import { draftFromNote } from './noteEditing';
import { formatPages } from './noteSearch';
import { loadNotesRepo, useNotes, useTags } from './NotesProvider';

export function NoteDetailScreen() {
  const { noteId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useSessionUser();
  const online = useOnline();
  const { status, notes } = useNotes();
  const { books } = useBooks();
  const { tags, tagsById } = useTags();
  const note = notes.find((n) => n.id === noteId);
  const book = books.find((b) => b.id === note?.bookId);
  const bookIds = useMemo(() => new Set(books.map((b) => b.id)), [books]);
  const justSaved = (location.state as { saved?: boolean } | null)?.saved === true;

  const [editing, setEditing] = useState<NoteDraft | null>(null);
  const [errors, setErrors] = useState<NoteDraftErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteState, setDeleteState] = useState<'idle' | 'confirm' | 'deleting'>('idle');

  if (!note) {
    return (
      <>
        <FlowHeader eyebrow={copy.notes.detailEyebrow} backLabel={copy.review.back} />
        {status === 'loading' ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : (
          <EmptyState
            title={copy.notes.notFound}
            action={
              <ButtonLink to="/notes" variant="secondary">
                {copy.nav.notes}
              </ButtonLink>
            }
          />
        )}
      </>
    );
  }

  const saveEdit = async () => {
    if (!editing) return;
    const result = validateNoteDraft(editing, bookIds);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    if (!online) {
      setError(copy.noteForm.offlineSave);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const repo = await loadNotesRepo();
      await repo.updateNote(user.uid, note.id, result.input, result.newTags);
      setEditing(null);
    } catch {
      setError(copy.noteForm.saveError);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setDeleteState('deleting');
    try {
      const repo = await loadNotesRepo();
      await repo.deleteNote(user.uid, note.id);
      navigate('/notes', { replace: true });
    } catch {
      setDeleteState('idle');
      setError(copy.notes.deleteError);
    }
  };

  if (editing) {
    return (
      <>
        <FlowHeader eyebrow={copy.notes.detailEyebrow} backLabel={copy.noteForm.cancel} onBack={() => setEditing(null)} />
        <h1 className="m-0 mb-6 text-[24px] font-semibold tracking-[-0.03em]">{copy.noteForm.editTitle}</h1>
        <NoteForm
          draft={editing}
          errors={errors}
          onChange={setEditing}
          books={books}
          tags={tags}
          createTagId={newDocId}
          onSubmit={() => void saveEdit()}
          submitLabel={copy.noteForm.saveChanges}
          busyLabel={copy.noteForm.saving}
          busy={busy}
          error={error}
          secondaryAction={
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>
              {copy.noteForm.cancel}
            </Button>
          }
        />
      </>
    );
  }

  const pages = formatPages(note);
  const tagChips = (ids: string[]) => ids.map((id) => tagsById.get(id)).filter((t) => t !== undefined);

  return (
    <>
      <FlowHeader eyebrow={copy.notes.detailEyebrow} backLabel={copy.review.back} />
      {justSaved && (
        <div className="mb-4">
          <Notice tone="success" live="polite">
            {copy.notes.saved}
          </Notice>
        </div>
      )}

      {/* 見た目は書籍のリンクと本文で十分なため、見出しは読み上げ用にだけ置く */}
      <h1 className="sr-only">{copy.notes.detailHeading(book?.title ?? copy.notes.unknownBook, pages)}</h1>
      <Link
        to={book ? `/books/${book.id}` : '/books'}
        className="mb-6 flex items-center gap-3 rounded-md text-text no-underline hover:bg-surface-subtle"
      >
        <span className="w-10 shrink-0">
          <BookCover title={book?.title ?? ''} coverUrl={book?.coverUrl ?? null} size="sm" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-semibold">{book?.title ?? copy.notes.unknownBook}</span>
          <span className="block text-[12px] text-text-secondary">{[book?.authors.join('、'), pages].filter(Boolean).join(' · ')}</span>
        </span>
      </Link>

      <SurfaceCard className="flex flex-col gap-6 p-6">
        {note.quote && (
          <section aria-label={copy.notes.quote}>
            <h2 className="eyebrow m-0 mb-2 normal-case tracking-[0.08em]">{copy.notes.quote}</h2>
            <blockquote className="m-0 whitespace-pre-wrap border-l-[3px] border-accent pl-4 font-quote text-[17px] leading-[1.9]">
              {note.quote}
            </blockquote>
          </section>
        )}
        {note.comment && (
          <section aria-label={copy.notes.comment}>
            <h2 className="eyebrow m-0 mb-2 normal-case tracking-[0.08em]">{copy.notes.comment}</h2>
            <p className="m-0 whitespace-pre-wrap text-[15px] leading-[1.75]">{note.comment}</p>
          </section>
        )}
        {(note.topicTagIds.length > 0 || note.usageTagIds.length > 0 || note.usageStatus !== 'unassigned') && (
          <div className="flex flex-wrap gap-1.5">
            {[...tagChips(note.topicTagIds), ...tagChips(note.usageTagIds)].map((t) => (
              <Link
                key={t.id}
                to={`/notes?${t.category === 'topic' ? 'topicTagId' : 'usageTagId'}=${t.id}`}
                className="rounded-pill bg-halo-outer px-3 py-1 text-[12px] font-medium text-text no-underline"
              >
                #{t.name}
              </Link>
            ))}
            {note.usageStatus !== 'unassigned' && (
              <span className="rounded-pill border border-border px-3 py-1 text-[12px] text-text-secondary">
                {copy.noteForm.status[note.usageStatus]}
              </span>
            )}
          </div>
        )}
        {note.transcript && (
          <details className="text-[13px] text-text-secondary">
            <summary className="cursor-pointer">{copy.notes.transcript}</summary>
            <p className="m-0 mt-2 whitespace-pre-wrap">{note.transcript}</p>
          </details>
        )}
      </SurfaceCard>

      <p className="m-0 mt-3 text-[12px] text-text-secondary">
        {[note.inputMethod === 'voice' ? copy.notes.voice : copy.notes.manual, copy.notes.created(formatDateTime(note.createdAt)), copy.notes.updated(formatDateTime(note.updatedAt))].join(' · ')}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => setEditing(draftFromNote(note, tagsById))}>
          {copy.notes.edit}
        </Button>
        <Button variant="secondary" onClick={() => setDeleteState('confirm')} className="!text-error">
          {copy.notes.delete}
        </Button>
        <Button
          variant="ghost"
          className="col-span-2"
          onClick={() => downloadText(markdownFileName(book?.title ?? 'note'), noteToMarkdown(note, book, tagsById), 'text/markdown')}
        >
          {copy.backup.exportNote}
        </Button>
      </div>
      {error && (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <ConfirmDialog
        open={deleteState !== 'idle'}
        title={copy.notes.deleteTitle}
        confirmLabel={deleteState === 'deleting' ? copy.notes.deleting : copy.notes.deleteConfirm}
        cancelLabel={copy.notes.cancel}
        destructive
        busy={deleteState === 'deleting'}
        onCancel={() => setDeleteState('idle')}
        onConfirm={() => void confirmDelete()}
      >
        <p className="m-0">{copy.notes.deleteBody}</p>
      </ConfirmDialog>
    </>
  );
}
