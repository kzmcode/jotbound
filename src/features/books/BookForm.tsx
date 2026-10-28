import type { FormEvent, ReactNode } from 'react';
import { copy } from '../../app/copy';
import { Button } from '../../components/ui/Button';
import { SurfaceCard } from '../../components/ui/Card';
import { Notice } from '../../components/ui/Feedback';
import { TextField } from '../../components/ui/Field';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import type { ReadingStatus } from '../../types/models';
import { BookCover } from './BookCover';
import type { BookDraft, BookDraftErrors } from './bookDraft';

const statusOptions: { value: ReadingStatus; label: string }[] = [
  { value: 'unread', label: copy.books.status.unread },
  { value: 'reading', label: copy.books.status.reading },
  { value: 'finished', label: copy.books.status.finished },
];

export function BookForm({
  draft,
  errors,
  onChange,
  onSubmit,
  submitLabel,
  busyLabel,
  busy,
  error,
  secondaryAction,
}: {
  draft: BookDraft;
  errors: BookDraftErrors;
  onChange: (draft: BookDraft) => void;
  onSubmit: () => void;
  submitLabel: string;
  busyLabel: string;
  busy: boolean;
  error?: string | null;
  secondaryAction?: ReactNode;
}) {
  const set = <K extends keyof BookDraft>(key: K, value: BookDraft[K]) => onChange({ ...draft, [key]: value });
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) onSubmit();
  };
  const coverPreview = draft.coverProvider !== 'none' ? draft.coverUrl : null;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <SurfaceCard className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-4">
          <div className="w-20 shrink-0">
            <BookCover title={draft.title || copy.books.formTitle} coverUrl={coverPreview} size="sm" />
          </div>
          <p className="m-0 self-center text-[12px] text-text-secondary">
            {coverPreview ? copy.books.attribution : copy.books.formCoverNone}
          </p>
        </div>
        <TextField
          label={copy.books.formTitle}
          required
          value={draft.title}
          onChange={(e) => set('title', e.target.value)}
          error={errors.title}
          maxLength={200}
          autoComplete="off"
        />
        <TextField
          label={copy.books.formAuthors}
          hint={copy.books.formAuthorsHint}
          value={draft.authors}
          onChange={(e) => set('authors', e.target.value)}
          error={errors.authors}
          autoComplete="off"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={copy.books.formIsbn}
            value={draft.isbn}
            onChange={(e) => set('isbn', e.target.value)}
            error={errors.isbn}
            inputMode="numeric"
            autoComplete="off"
          />
          <TextField
            label={copy.books.formPublisher}
            value={draft.publisher}
            onChange={(e) => set('publisher', e.target.value)}
            error={errors.publisher}
            maxLength={200}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold" aria-hidden="true">
            {copy.books.formStatus}
          </span>
          <SegmentedControl
            name="readingStatus"
            legend={copy.books.formStatus}
            value={draft.readingStatus}
            options={statusOptions}
            onChange={(v) => set('readingStatus', v)}
          />
        </div>
        <TextField
          label={copy.books.formAliases}
          hint={copy.books.formAliasesHint}
          value={draft.aliases}
          onChange={(e) => set('aliases', e.target.value)}
          error={errors.aliases}
          autoComplete="off"
        />
      </SurfaceCard>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={busy} aria-busy={busy}>
        {busy ? busyLabel : submitLabel}
      </Button>
      {secondaryAction}
    </form>
  );
}
