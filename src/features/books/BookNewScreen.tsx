import { useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useSessionUser } from '../../app/auth';
import { copy } from '../../app/copy';
import { SearchIcon } from '../../components/icons';
import { FlowHeader } from '../../components/layout/FlowHeader';
import { useOnline } from '../../components/layout/StatusBanners';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Notice } from '../../components/ui/Feedback';
import { TextField } from '../../components/ui/Field';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { ScreenTitle } from '../../components/ui/Typography';
import { resolveCover } from '../../services/books/covers';
import { BooksSearchError, searchGoogleBooks, type BookCandidate } from '../../services/books/googleBooks';
import type { BookInput } from '../../services/firebase/books';
import { booksApiKey } from '../../services/firebase/config';
import { BookCover } from './BookCover';
import { BookForm } from './BookForm';
import { emptyDraft, validateDraft, type BookDraft, type BookDraftErrors } from './bookDraft';
import { findPossibleDuplicates } from './bookUtils';
import { GoogleBooksLink } from './GoogleBooksLink';
import { loadBooksRepo, useBooks } from './BooksProvider';

// ISBN 検索は Google Books API の不具合（ISBN 指定が0件になる）のため、いったん画面から外している
type Mode = 'title' | 'manual';
type SearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'done'; results: BookCandidate[] }
  | { status: 'error'; message: string };

/** 書籍登録: 書名検索 / 手入力 → 候補を確認・編集して登録（要件 SCR-03） */
export function BookNewScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  // 確認画面から「この本を登録する」で来た場合: 書名を引き継ぎ、登録後は確認画面へ戻る
  const from = (location.state ?? {}) as { title?: string; returnTo?: string };
  const initialTitle = from.title?.trim() ?? '';
  const user = useSessionUser();
  const { books } = useBooks();
  const online = useOnline();
  const [mode, setMode] = useState<Mode>(booksApiKey ? 'title' : 'manual');
  const [term, setTerm] = useState(booksApiKey ? initialTitle : '');
  const [termError, setTermError] = useState<string>();
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });
  const [draft, setDraft] = useState<BookDraft | null>(booksApiKey ? null : { ...emptyDraft, title: initialTitle });
  const [errors, setErrors] = useState<BookDraftErrors>({});
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<{ input: BookInput; titles: string[] } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const changeMode = (m: Mode) => {
    setMode(m);
    setTerm('');
    setTermError(undefined);
    setSearch({ status: 'idle' });
    setDraft(m === 'manual' ? emptyDraft : null);
    setErrors({});
    setSaveError(null);
  };

  const runSearch = async (e: FormEvent) => {
    e.preventDefault();
    const value = term.trim();
    if (!value) return;
    const query = { title: value };
    setTermError(undefined);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSearch({ status: 'searching' });
    try {
      const results = await searchGoogleBooks(query, booksApiKey, controller.signal);
      setSearch({ status: 'done', results });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const kind = err instanceof BooksSearchError ? err.kind : 'http';
      setSearch({ status: 'error', message: copy.books.searchErrors[kind] });
    }
  };

  const selectCandidate = async (c: BookCandidate) => {
    setDraft({
      ...emptyDraft,
      title: c.title,
      authors: c.authors.join('、'),
      isbn: c.isbn13 ?? '',
      publisher: c.publisher ?? '',
      coverUrl: c.coverUrl,
      coverProvider: c.coverProvider,
      externalSourceId: c.externalSourceId,
    });
    setErrors({});
    // Google に書影がなければ Open Library を確認する
    if (c.coverProvider === 'none' && c.isbn13) {
      const cover = await resolveCover(c, c.isbn13);
      setDraft((d) => (d && d.externalSourceId === c.externalSourceId ? { ...d, ...cover } : d));
    }
  };

  const save = async (input: BookInput) => {
    setBusy(true);
    setSaveError(null);
    try {
      const cover = input.coverProvider === 'none' ? await resolveCover(input, input.isbn13) : input;
      const repo = await loadBooksRepo();
      const id = await repo.createBook(user.uid, { ...input, ...cover });
      if (from.returnTo?.startsWith('/review/')) navigate(from.returnTo, { replace: true, state: { newBookId: id } });
      else navigate(`/books/${id}`, { replace: true });
    } catch {
      setSaveError(copy.books.saveError);
      setBusy(false);
    }
  };

  const submit = () => {
    if (!draft) return;
    const result = validateDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    if (!online) {
      setSaveError(copy.books.offlineSave);
      return;
    }
    const dups = findPossibleDuplicates(books, result.input);
    if (dups.length > 0) {
      setDuplicates({ input: result.input, titles: dups.map((b) => b.title) });
      return;
    }
    void save(result.input);
  };

  return (
    <>
      <FlowHeader eyebrow={copy.books.newEyebrow} backLabel={copy.review.back} />
      <ScreenTitle title={copy.books.newTitle} subtitle={copy.books.newSubtitle} />

      <div className="mb-6">
        <SegmentedControl
          name="bookMode"
          legend={copy.books.modeLegend}
          value={mode}
          onChange={changeMode}
          options={[
            { value: 'title', label: copy.books.modeTitle },
            { value: 'manual', label: copy.books.modeManual },
          ]}
        />
      </div>

      {mode !== 'manual' && !draft && (
        <section aria-label={copy.books.modeTitle} className="flex flex-col gap-4">
          {!booksApiKey ? (
            <Notice
              action={
                <Button variant="ghost" className="min-h-9 shrink-0 px-3 text-[13px]" onClick={() => changeMode('manual')}>
                  {copy.books.toManual}
                </Button>
              }
            >
              {copy.books.searchErrors.notConfigured}
            </Notice>
          ) : (
            <form onSubmit={runSearch} className="flex items-end gap-2" noValidate>
              <div className="min-w-0 flex-1">
                <TextField
                  label={copy.books.titleSearchLabel}
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  error={termError}
                  inputMode="search"
                  enterKeyHint="search"
                  autoComplete="off"
                />
              </div>
              <Button
                type="submit"
                className={`shrink-0 px-4 ${termError ? 'mb-[26px]' : ''}`}
                disabled={!online || search.status === 'searching' || !term.trim()}
                icon={<SearchIcon size={18} />}
              >
                {copy.books.search}
              </Button>
            </form>
          )}

          {!online && <Notice>{copy.books.offlineSearch}</Notice>}
          <div aria-live="polite">
            {search.status === 'searching' && <p className="m-0 text-[13px] text-text-secondary">{copy.books.searching}</p>}
            {search.status === 'error' && (
              <Notice
                tone="error"
                action={
                  <Button variant="ghost" className="min-h-9 shrink-0 px-3 text-[13px]" onClick={() => changeMode('manual')}>
                    {copy.books.toManual}
                  </Button>
                }
              >
                {search.message}
              </Notice>
            )}
            {search.status === 'done' &&
              (search.results.length === 0 ? (
                <Notice
                  action={
                    <Button variant="ghost" className="min-h-9 shrink-0 px-3 text-[13px]" onClick={() => changeMode('manual')}>
                      {copy.books.toManual}
                    </Button>
                  }
                >
                  {copy.books.notFound}
                </Notice>
              ) : (
                <>
                  <p className="m-0 mb-2 text-[12px] text-text-secondary">{copy.books.results(search.results.length)}</p>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {search.results.map((c) => (
                      <li key={c.externalSourceId}>
                        <button
                          type="button"
                          onClick={() => void selectCandidate(c)}
                          className="flex w-full items-center gap-3 rounded-md border border-border bg-surface p-3 text-left text-text transition-colors duration-[160ms] hover:border-accent"
                        >
                          <span className="w-12 shrink-0">
                            <BookCover title={c.title} coverUrl={c.coverUrl} size="sm" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-2 block text-[14px] font-semibold">{c.title}</span>
                            <span className="mt-0.5 block truncate text-[12px] text-text-secondary">
                              {[c.authors.join('、'), c.publisher].filter(Boolean).join(' · ')}
                            </span>
                            {c.isbn13 && <span className="block text-[11px] text-text-secondary">ISBN {c.isbn13}</span>}
                          </span>
                          <span className="sr-only">{copy.books.select}</span>
                        </button>
                        <GoogleBooksLink externalSourceId={c.externalSourceId} className="ml-3 mt-1 inline-block text-[12px]" />
                      </li>
                    ))}
                  </ul>
                  <p className="m-0 mt-3 text-[11px] text-text-secondary">{copy.books.attribution}</p>
                </>
              ))}
          </div>
        </section>
      )}

      {draft && (
        <BookForm
          draft={draft}
          errors={errors}
          onChange={setDraft}
          onSubmit={submit}
          submitLabel={copy.books.register}
          busyLabel={copy.books.registering}
          busy={busy}
          error={saveError}
          secondaryAction={
            mode !== 'manual' ? (
              <Button variant="secondary" onClick={() => setDraft(null)} disabled={busy}>
                {copy.books.cancel}
              </Button>
            ) : undefined
          }
        />
      )}

      <ConfirmDialog
        open={duplicates !== null}
        title={copy.books.duplicateTitle}
        confirmLabel={copy.books.duplicateConfirm}
        cancelLabel={copy.books.cancel}
        onCancel={() => setDuplicates(null)}
        onConfirm={() => {
          const input = duplicates?.input;
          setDuplicates(null);
          if (input) void save(input);
        }}
      >
        <p className="m-0">{copy.books.duplicateBody}</p>
        <ul className="m-0 mt-2 pl-5">
          {duplicates?.titles.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </ConfirmDialog>
    </>
  );
}
