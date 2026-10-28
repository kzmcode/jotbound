import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useSessionUser } from '../../app/auth';
import { copy } from '../../app/copy';
import { MicIcon, NoteIcon, PlusIcon } from '../../components/icons';
import { FlowHeader } from '../../components/layout/FlowHeader';
import { useOnline } from '../../components/layout/StatusBanners';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, Notice, Skeleton } from '../../components/ui/Feedback';
import { GlassCard } from '../../components/ui/Card';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { SectionHeading } from '../../components/ui/Typography';
import { downloadText } from '../../lib/download';
import { markdownFileName } from '../backup/backupFormat';
import { bookToMarkdown } from '../backup/markdown';
import { NoteListItem } from '../notes/NoteListItem';
import { useNotes, useTags } from '../notes/NotesProvider';
import { resolveCover } from '../../services/books/covers';
import { BookCover } from './BookCover';
import { BookForm } from './BookForm';
import { draftFromBook, validateDraft, type BookDraft, type BookDraftErrors } from './bookDraft';
import { findPossibleDuplicates, googleBooksUrl } from './bookUtils';
import { GoogleBooksLink } from './GoogleBooksLink';
import { loadBooksRepo, useBooks } from './BooksProvider';
import type { BookInput } from '../../services/firebase/books';

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 text-[13px]">
      <dt className="w-16 shrink-0 text-text-secondary">{label}</dt>
      <dd className="m-0 min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function BookDetailScreen() {
  const { bookId = '' } = useParams();
  const navigate = useNavigate();
  const user = useSessionUser();
  const online = useOnline();
  const { status, books } = useBooks();
  const book = books.find((b) => b.id === bookId);

  const [editing, setEditing] = useState<BookDraft | null>(null);
  const [errors, setErrors] = useState<BookDraftErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateTitles, setDuplicateTitles] = useState<string[] | null>(null);
  const [deleteState, setDeleteState] = useState<'idle' | 'confirm' | 'deleting'>('idle');
  const [noteSort, setNoteSort] = useState<'page' | 'date'>('page');
  const { notes } = useNotes();
  const { tagsById } = useTags();
  // この本のメモ（ページ順／日付順。要件 SCR-03）
  const bookNotes = useMemo(() => {
    const list = notes.filter((n) => n.bookId === bookId);
    const created = (n: (typeof list)[number]) => n.createdAt?.toMillis() ?? 0;
    return noteSort === 'page'
      ? list.sort((a, b) => (a.pageStart ?? Infinity) - (b.pageStart ?? Infinity) || created(a) - created(b))
      : list.sort((a, b) => created(b) - created(a));
  }, [notes, bookId, noteSort]);

  if (!book) {
    return (
      <>
        <FlowHeader eyebrow={copy.books.detailEyebrow} backLabel={copy.review.back} />
        {status === 'loading' ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : (
          <EmptyState
            title={copy.books.notFoundTitle}
            action={
              <ButtonLink to="/books" variant="secondary">
                {copy.nav.books}
              </ButtonLink>
            }
          />
        )}
      </>
    );
  }

  const saveEdit = async (force = false) => {
    if (!editing) return;
    const result = validateDraft(editing);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    if (!online) {
      setError(copy.books.offlineSave);
      return;
    }
    const dups = findPossibleDuplicates(books, result.input, book.id);
    if (!force && dups.length > 0 && (result.input.isbn13 !== book.isbn13 || result.input.titleNormalized !== book.titleNormalized)) {
      setDuplicateTitles(dups.map((b) => b.title));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const input = result.input;
      const cover = input.coverProvider === 'none' ? await resolveCover(input, input.isbn13) : input;
      const repo = await loadBooksRepo();
      await repo.updateBook(user.uid, book.id, { ...input, ...cover });
      setEditing(null);
    } catch {
      setError(copy.books.saveError);
    } finally {
      setBusy(false);
    }
  };

  const requestDelete = async () => {
    setError(null);
    try {
      const repo = await loadBooksRepo();
      // 端末キャッシュではなくサーバーで件数を確認する（未同期のメモを見落とさない）
      const n = await repo.countNotesForBook(user.uid, book.id);
      if (n > 0) {
        setError(copy.books.deleteBlocked(n));
        return;
      }
      setDeleteState('confirm');
    } catch {
      setError(copy.books.deleteCheckFailed);
    }
  };

  const confirmDelete = async () => {
    setDeleteState('deleting');
    try {
      const repo = await loadBooksRepo();
      await repo.deleteBook(user.uid, book.id);
      navigate('/books', { replace: true });
    } catch {
      setDeleteState('idle');
      setError(copy.books.deleteError);
    }
  };

  if (editing) {
    return (
      <>
        <FlowHeader eyebrow={copy.books.detailEyebrow} backLabel={copy.books.cancel} onBack={() => setEditing(null)} />
        <h1 className="m-0 mb-6 text-[24px] font-semibold tracking-[-0.03em]">{copy.books.edit}</h1>
        <BookForm
          draft={editing}
          errors={errors}
          onChange={setEditing}
          onSubmit={() => void saveEdit()}
          submitLabel={copy.books.saveChanges}
          busyLabel={copy.books.saving}
          busy={busy}
          error={error}
          secondaryAction={
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>
              {copy.books.cancel}
            </Button>
          }
        />
        <ConfirmDialog
          open={duplicateTitles !== null}
          title={copy.books.duplicateTitle}
          confirmLabel={copy.books.saveChanges}
          cancelLabel={copy.books.cancel}
          onCancel={() => setDuplicateTitles(null)}
          onConfirm={() => {
            setDuplicateTitles(null);
            void saveEdit(true);
          }}
        >
          <p className="m-0">{copy.books.duplicateBody}</p>
          <ul className="m-0 mt-2 pl-5">
            {duplicateTitles?.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </ConfirmDialog>
      </>
    );
  }

  /** 読書状態だけを変える（編集画面に入らずに切り替えられる）。オフラインでも端末に反映し、接続後に同期する */
  const changeStatus = (readingStatus: BookInput['readingStatus']) => {
    if (readingStatus === book.readingStatus) return;
    setError(null);
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = book;
    void loadBooksRepo()
      .then((repo) => repo.updateBook(user.uid, book.id, { ...input, readingStatus }))
      .catch(() => setError(copy.books.statusError));
  };

  return (
    <>
      <FlowHeader eyebrow={copy.books.detailEyebrow} backLabel={copy.review.back} />
      <section className="flex gap-5">
        <div className="w-28 shrink-0 sm:w-32">
          <BookCover title={book.title} coverUrl={book.coverUrl} size="lg" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[22px] font-semibold leading-snug tracking-[-0.02em]">{book.title}</h1>
          {book.authors.length > 0 && <p className="m-0 mt-1 text-[14px] text-text-secondary">{book.authors.join('、')}</p>}
          <dl className="m-0 mt-3 flex flex-col gap-1">
            {book.publisher && <Meta label={copy.books.metaPublisher}>{book.publisher}</Meta>}
            {book.isbn13 && <Meta label={copy.books.metaIsbn}>{book.isbn13}</Meta>}
            {book.aliases.length > 0 && <Meta label={copy.books.metaAliases}>{book.aliases.join('、')}</Meta>}
            {googleBooksUrl(book.externalSourceId) && (
              <Meta label={copy.books.metaSource}>
                <GoogleBooksLink externalSourceId={book.externalSourceId} />
              </Meta>
            )}
          </dl>
        </div>
      </section>

      <div className="mt-5" data-testid="reading-status">
        <SegmentedControl
          name="bookReadingStatus"
          legend={copy.books.statusLegend}
          value={book.readingStatus}
          onChange={changeStatus}
          options={(['unread', 'reading', 'finished'] as const).map((v) => ({ value: v, label: copy.books.status[v] }))}
        />
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <ButtonLink to={`/record?bookId=${encodeURIComponent(book.id)}`} icon={<MicIcon size={18} />}>
          {copy.books.recordWithBook}
        </ButtonLink>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setEditing(draftFromBook(book))}>
            {copy.books.edit}
          </Button>
          <Button variant="secondary" onClick={() => void requestDelete()} className="!text-error">
            {copy.books.delete}
          </Button>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
      </div>

      <section aria-labelledby="book-notes" className="mt-10">
        <SectionHeading
          id="book-notes"
          action={
            <ButtonLink to={`/notes/new?bookId=${encodeURIComponent(book.id)}`} variant="ghost" className="min-h-11 px-2 text-[13px]" icon={<PlusIcon size={16} />}>
              {copy.notes.newManual}
            </ButtonLink>
          }
        >
          {copy.books.notesHeading}
          <span className="ml-2 text-[13px] font-normal text-text-secondary">{copy.notes.count(bookNotes.length)}</span>
        </SectionHeading>
        {bookNotes.length === 0 ? (
          <EmptyState icon={<NoteIcon size={22} />} title={copy.books.notesEmpty} />
        ) : (
          <>
            <div className="mb-3">
              <SegmentedControl
                name="bookNoteSort"
                legend={copy.notes.sort}
                value={noteSort}
                onChange={setNoteSort}
                options={[
                  { value: 'page', label: copy.books.sortPage },
                  { value: 'date', label: copy.books.sortDate },
                ]}
              />
            </div>
            <GlassCard className="px-4 py-1">
              <ul aria-label={copy.books.notesHeading} className="m-0 list-none divide-y divide-border p-0">
                {bookNotes.map((n) => (
                  <li key={n.id}>
                    <NoteListItem note={n} book={book} tagsById={tagsById} showBook={false} />
                  </li>
                ))}
              </ul>
            </GlassCard>
            <Button
              variant="ghost"
              className="mt-3 w-full"
              onClick={() => downloadText(markdownFileName(book.title), bookToMarkdown(book, bookNotes, tagsById), 'text/markdown')}
            >
              {copy.backup.exportBookNotes}
            </Button>
          </>
        )}
      </section>

      <ConfirmDialog
        open={deleteState !== 'idle'}
        title={copy.books.deleteTitle}
        confirmLabel={deleteState === 'deleting' ? copy.books.deleting : copy.books.deleteConfirm}
        cancelLabel={copy.books.cancel}
        destructive
        busy={deleteState === 'deleting'}
        onCancel={() => setDeleteState('idle')}
        onConfirm={() => void confirmDelete()}
      >
        <p className="m-0">
          「{book.title}」 — {copy.books.deleteBody}
        </p>
      </ConfirmDialog>
    </>
  );
}
