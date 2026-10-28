import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { copy } from '../../app/copy';
import { BooksIcon, PlusIcon, SearchIcon } from '../../components/icons';
import { TopBar } from '../../components/layout/TopBar';
import { Button, ButtonLink } from '../../components/ui/Button';
import { EmptyState, Notice, Skeleton } from '../../components/ui/Feedback';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { ScreenTitle } from '../../components/ui/Typography';
import type { ReadingStatus } from '../../types/models';
import { BookCover } from './BookCover';
import { normalizeTitle } from './bookUtils';
import { useBooks } from './BooksProvider';

type StatusFilter = 'all' | ReadingStatus;

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: copy.books.statusAll },
  { value: 'unread', label: copy.books.status.unread },
  { value: 'reading', label: copy.books.status.reading },
  { value: 'finished', label: copy.books.status.finished },
];

export function BooksScreen() {
  const state = useBooks();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const filtered = useMemo(() => {
    const q = normalizeTitle(query);
    return state.books.filter(
      (b) =>
        (status === 'all' || b.readingStatus === status) &&
        (!q || b.titleNormalized.includes(q) || b.authors.some((a) => normalizeTitle(a).includes(q))),
    );
  }, [state.books, query, status]);

  const hasBooks = state.books.length > 0;

  return (
    <>
      <TopBar />
      <div className="flex items-start justify-between gap-3">
        <ScreenTitle eyebrow={copy.books.heroEn} title={copy.books.title} subtitle={copy.books.subtitle} />
        <ButtonLink to="/books/new" variant="secondary" className="shrink-0 px-4 text-[13px]" icon={<PlusIcon size={18} />}>
          {copy.books.add}
        </ButtonLink>
      </div>

      {state.status === 'error' && (
        <div className="mb-4">
          <Notice
            tone="error"
            action={
              <Button variant="ghost" className="min-h-9 shrink-0 px-3 text-[13px]" onClick={state.retry}>
                {copy.books.retry}
              </Button>
            }
          >
            {copy.books.loadError}
          </Notice>
        </div>
      )}

      {hasBooks && (
        <div className="mb-6 flex flex-col gap-3">
          <label className="relative block">
            <span className="sr-only">{copy.books.filterLabel}</span>
            <SearchIcon size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={copy.books.filterPlaceholder}
              className="block w-full rounded-pill border border-border bg-surface py-3 pl-11 pr-4 text-base text-text placeholder:text-text-secondary/70 hover:border-accent focus-visible:border-accent"
            />
          </label>
          <SegmentedControl name="statusFilter" legend={copy.books.statusLegend} value={status} options={statusOptions} onChange={setStatus} />
        </div>
      )}

      {state.status === 'loading' && !hasBooks ? (
        <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="aspect-[2/3] w-full rounded-[10px]" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </div>
      ) : !hasBooks ? (
        <EmptyState
          icon={<BooksIcon size={22} />}
          title={copy.books.empty}
          hint={copy.books.emptyHint}
          action={
            <ButtonLink to="/books/new" icon={<PlusIcon size={18} />}>
              {copy.books.add}
            </ButtonLink>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<SearchIcon size={22} />} title={copy.books.noMatch} />
      ) : (
        <>
          <p className="m-0 mb-3 text-[12px] text-text-secondary" aria-live="polite">
            {copy.books.count(filtered.length)}
          </p>
          <ul aria-label={copy.books.listLabel} className="m-0 grid list-none grid-cols-3 gap-x-4 gap-y-6 p-0 sm:grid-cols-4">
            {filtered.map((b) => (
              <li key={b.id}>
                <Link to={`/books/${b.id}`} className="group flex flex-col gap-2 rounded-sm text-text no-underline">
                  <BookCover title={b.title} coverUrl={b.coverUrl} className="transition-transform duration-[160ms] group-hover:-translate-y-0.5" />
                  <span className="line-clamp-2 text-[13px] font-semibold leading-snug">{b.title}</span>
                  {b.authors.length > 0 && (
                    <span className="-mt-1.5 line-clamp-1 text-[11px] text-text-secondary">{b.authors.join('、')}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
