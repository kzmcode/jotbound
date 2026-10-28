import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { copy } from '../../app/copy';
import { NoteIcon, PlusIcon, SearchIcon } from '../../components/icons';
import { TopBar } from '../../components/layout/TopBar';
import { Button, ButtonLink } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/Card';
import { EmptyState, Notice, Skeleton } from '../../components/ui/Feedback';
import { SelectField, TextField } from '../../components/ui/Field';
import { ScreenTitle } from '../../components/ui/Typography';
import type { UsageStatus } from '../../types/models';
import { useBooks } from '../books/BooksProvider';
import { NoteListItem } from './NoteListItem';
import { emptyFilter, isFiltering, searchNotes, type NoteFilter, type NoteSort } from './noteSearch';
import { useNotes, useTags } from './NotesProvider';

export function NotesScreen() {
  const [params] = useSearchParams();
  const { status, notes, ...notesState } = useNotes();
  const { books } = useBooks();
  const { tags, tagsById } = useTags();
  const [filter, setFilter] = useState<NoteFilter>(() => ({
    ...emptyFilter,
    bookId: params.get('bookId') ?? '',
    topicTagId: params.get('topicTagId') ?? '',
    usageTagId: params.get('usageTagId') ?? '',
  }));
  const set = <K extends keyof NoteFilter>(key: K, value: NoteFilter[K]) => setFilter((f) => ({ ...f, [key]: value }));

  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const results = useMemo(() => searchNotes(notes, filter, booksById, tagsById), [notes, filter, booksById, tagsById]);
  const filtering = isFiltering(filter);
  const panelActive = Boolean(filter.bookId || filter.topicTagId || filter.usageTagId || filter.usageStatus || filter.dateFrom || filter.dateTo || filter.sort !== 'updated');
  const sortedBooks = useMemo(() => [...books].sort((a, b) => a.titleNormalized.localeCompare(b.titleNormalized, 'ja')), [books]);
  const topicTags = tags.filter((t) => t.category === 'topic');
  const usageTags = tags.filter((t) => t.category === 'usage');

  return (
    <>
      <TopBar />
      <div className="flex items-start justify-between gap-3">
        <ScreenTitle eyebrow={copy.notes.heroEn} title={copy.notes.title} subtitle={copy.notes.subtitle} />
        <ButtonLink to="/notes/new" variant="secondary" className="shrink-0 px-4 text-[13px]" icon={<PlusIcon size={18} />}>
          {copy.notes.newManual}
        </ButtonLink>
      </div>

      {status === 'error' && 'retry' in notesState && (
        <div className="mb-4">
          <Notice
            tone="error"
            action={
              <Button variant="ghost" className="min-h-9 shrink-0 px-3 text-[13px]" onClick={notesState.retry}>
                {copy.notes.retry}
              </Button>
            }
          >
            {copy.notes.loadError}
          </Notice>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3">
        <label className="relative block">
          <span className="sr-only">{copy.notes.searchLabel}</span>
          <SearchIcon size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            type="search"
            value={filter.query}
            onChange={(e) => set('query', e.target.value)}
            placeholder={copy.notes.searchPlaceholder}
            className="block w-full rounded-pill border border-border bg-surface py-3 pl-11 pr-4 text-base text-text placeholder:text-text-secondary/70 hover:border-accent focus-visible:border-accent"
          />
        </label>
        <details open={panelActive || undefined} className="rounded-md border border-border bg-surface-subtle">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 text-[13px] font-semibold text-text">
            {copy.notes.filters}
          </summary>
          <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
            <SelectField label={copy.notes.filterBook} value={filter.bookId} onChange={(e) => set('bookId', e.target.value)}>
              <option value="">{copy.notes.filterAll}</option>
              {sortedBooks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </SelectField>
            <SelectField label={copy.notes.filterStatus} value={filter.usageStatus} onChange={(e) => set('usageStatus', e.target.value as '' | UsageStatus)}>
              <option value="">{copy.notes.filterAll}</option>
              <option value="unassigned">{copy.noteForm.status.unassigned}</option>
              <option value="planned">{copy.noteForm.status.planned}</option>
              <option value="used">{copy.noteForm.status.used}</option>
            </SelectField>
            <SelectField label={copy.notes.filterTopic} value={filter.topicTagId} onChange={(e) => set('topicTagId', e.target.value)}>
              <option value="">{copy.notes.filterAll}</option>
              {topicTags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </SelectField>
            <SelectField label={copy.notes.filterUsage} value={filter.usageTagId} onChange={(e) => set('usageTagId', e.target.value)}>
              <option value="">{copy.notes.filterAll}</option>
              {usageTags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </SelectField>
            <TextField label={copy.notes.filterFrom} type="date" value={filter.dateFrom} onChange={(e) => set('dateFrom', e.target.value)} />
            <TextField label={copy.notes.filterTo} type="date" value={filter.dateTo} onChange={(e) => set('dateTo', e.target.value)} />
            <SelectField label={copy.notes.sort} value={filter.sort} onChange={(e) => set('sort', e.target.value as NoteSort)}>
              <option value="updated">{copy.notes.sortUpdated}</option>
              <option value="created">{copy.notes.sortCreated}</option>
              <option value="bookPage">{copy.notes.sortBookPage}</option>
            </SelectField>
            <div className="flex items-end">
              <Button variant="ghost" className="w-full" onClick={() => setFilter(emptyFilter)} disabled={!filtering && filter.sort === 'updated'}>
                {copy.notes.clearFilters}
              </Button>
            </div>
          </div>
        </details>
      </div>

      {status === 'loading' && notes.length === 0 ? (
        <div className="flex flex-col gap-3" aria-hidden="true">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <EmptyState icon={<NoteIcon size={22} />} title={copy.notes.empty} hint={copy.notes.emptyHint} />
      ) : results.length === 0 ? (
        <EmptyState icon={<SearchIcon size={22} />} title={copy.notes.searchEmpty} />
      ) : (
        <>
          <p className="m-0 mb-2 text-[12px] text-text-secondary" aria-live="polite">
            {copy.notes.count(results.length)}
          </p>
          <GlassCard className="px-4 py-1">
            <ul aria-label={copy.notes.listLabel} className="m-0 list-none divide-y divide-border p-0">
              {results.map((n) => (
                <li key={n.id}>
                  <NoteListItem note={n} book={booksById.get(n.bookId)} tagsById={tagsById} />
                </li>
              ))}
            </ul>
          </GlassCard>
        </>
      )}
    </>
  );
}
