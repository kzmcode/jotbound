import type { FormEvent, ReactNode } from 'react';
import { copy } from '../../app/copy';
import { Button, ButtonLink } from '../../components/ui/Button';
import { SurfaceCard } from '../../components/ui/Card';
import { Notice } from '../../components/ui/Feedback';
import { SelectField, TextAreaField, TextField } from '../../components/ui/Field';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import type { BookRecord } from '../../services/firebase/books';
import type { TagRecord } from '../../services/firebase/tags';
import type { UsageStatus } from '../../types/models';
import { TagPicker } from '../tags/TagPicker';
import type { NoteDraft, NoteDraftErrors } from './noteDraft';

const statusOptions: { value: UsageStatus; label: string }[] = [
  { value: 'unassigned', label: copy.noteForm.status.unassigned },
  { value: 'planned', label: copy.noteForm.status.planned },
  { value: 'used', label: copy.noteForm.status.used },
];

/**
 * メモの編集フォーム（手入力・編集・AI抽出結果の確認で共通）。
 * 本文は不透明な面に置き、保存はボタン押下時のみ（自動保存しない）。
 */
export function NoteForm({
  draft,
  errors,
  onChange,
  books,
  tags,
  createTagId,
  onSubmit,
  submitLabel,
  busyLabel,
  busy,
  error,
  before,
  secondaryAction,
  tagProposals,
  bookNotice,
}: {
  draft: NoteDraft;
  errors: NoteDraftErrors;
  onChange: (draft: NoteDraft) => void;
  books: readonly BookRecord[];
  tags: readonly TagRecord[];
  createTagId: () => string;
  onSubmit: () => void;
  submitLabel: string;
  busyLabel: string;
  busy: boolean;
  error?: string | null;
  /** フォームの前に差し込む内容（AI の警告・文字起こし等） */
  before?: ReactNode;
  secondaryAction?: ReactNode;
  /** AI のタグ候補（既存タグに一致しなかったもの） */
  tagProposals?: { topic: readonly string[]; usage: readonly string[] };
  /** 書籍欄の直下に表示する案内（AI の書名照合の結果など） */
  bookNotice?: ReactNode;
}) {
  const set = <K extends keyof NoteDraft>(key: K, value: NoteDraft[K]) => onChange({ ...draft, [key]: value });
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) onSubmit();
  };
  const sortedBooks = [...books].sort((a, b) => a.titleNormalized.localeCompare(b.titleNormalized, 'ja'));
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {before}
      <SurfaceCard className="flex flex-col gap-4 p-5">
        {books.length === 0 ? (
          <Notice
            tone="error"
            action={
              <ButtonLink to="/books/new" variant="ghost" className="min-h-9 shrink-0 px-3 text-[13px]">
                {copy.noteForm.registerBook}
              </ButtonLink>
            }
          >
            {copy.noteForm.noBooks}
          </Notice>
        ) : (
          <SelectField
            label={copy.noteForm.book}
            required
            value={draft.bookId}
            onChange={(e) => set('bookId', e.target.value)}
            error={errors.bookId}
          >
            <option value="">{copy.noteForm.bookPlaceholder}</option>
            {sortedBooks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
                {b.authors.length > 0 ? ` — ${b.authors.join('、')}` : ''}
              </option>
            ))}
          </SelectField>
        )}
        {bookNotice}

        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={copy.noteForm.pageStart}
            value={draft.pageStart}
            onChange={(e) => set('pageStart', e.target.value)}
            error={errors.pageStart}
            inputMode="numeric"
            autoComplete="off"
          />
          <TextField
            label={copy.noteForm.pageEnd}
            value={draft.pageEnd}
            onChange={(e) => set('pageEnd', e.target.value)}
            error={errors.pageEnd}
            inputMode="numeric"
            autoComplete="off"
          />
        </div>
        <p className="-mt-2 m-0 text-[12px] text-text-secondary">{copy.noteForm.pageHint}</p>

        <TextAreaField
          label={copy.noteForm.quote}
          hint={copy.noteForm.quoteHint}
          value={draft.quote}
          onChange={(e) => set('quote', e.target.value)}
          error={errors.quote}
          maxLength={5000}
          className="font-quote leading-[1.9]"
        />
        <TextAreaField
          label={copy.noteForm.comment}
          value={draft.comment}
          onChange={(e) => set('comment', e.target.value)}
          error={errors.comment ?? errors.body}
          maxLength={5000}
        />

        <TagPicker
          label={copy.noteForm.topicTags}
          hint={copy.noteForm.topicHint}
          category="topic"
          value={draft.topicTags}
          tags={tags}
          onChange={(v) => set('topicTags', v)}
          createId={createTagId}
          proposals={tagProposals?.topic}
        />
        <TagPicker
          label={copy.noteForm.usageTags}
          hint={copy.noteForm.usageHint}
          category="usage"
          value={draft.usageTags}
          tags={tags}
          onChange={(v) => set('usageTags', v)}
          createId={createTagId}
          proposals={tagProposals?.usage}
        />
        {errors.tags && <p className="m-0 text-[12px] font-medium text-error">{errors.tags}</p>}

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold" aria-hidden="true">
            {copy.noteForm.usageStatus}
          </span>
          <SegmentedControl
            name="usageStatus"
            legend={copy.noteForm.usageStatus}
            value={draft.usageStatus}
            options={statusOptions}
            onChange={(v) => set('usageStatus', v)}
          />
        </div>
      </SurfaceCard>

      {hasErrors && <Notice tone="error">{copy.noteForm.fixErrors}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={busy || books.length === 0} aria-busy={busy}>
        {busy ? busyLabel : submitLabel}
      </Button>
      {secondaryAction}
    </form>
  );
}
