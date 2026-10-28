import { copy } from '../../app/copy';
import type { NewTag, NoteInput } from '../../services/firebase/notes';
import { LIMITS, type InputMethod, type UsageStatus } from '../../types/models';
import { normalizeTagName } from '../tags/tagUtils';

/** タグの選択状態。isNew は保存時に作成する（ユーザーが確認して追加したもの） */
export type TagChoice = { id: string; name: string; isNew: boolean };

export type NoteDraft = {
  bookId: string;
  pageStart: string;
  pageEnd: string;
  quote: string;
  comment: string;
  topicTags: TagChoice[];
  usageTags: TagChoice[];
  usageStatus: UsageStatus;
  transcript: string | null;
  inputMethod: InputMethod;
};

export type NoteDraftErrors = Partial<Record<'bookId' | 'pageStart' | 'pageEnd' | 'quote' | 'comment' | 'body' | 'tags', string>>;

export const emptyNoteDraft = (bookId = ''): NoteDraft => ({
  bookId,
  pageStart: '',
  pageEnd: '',
  quote: '',
  comment: '',
  topicTags: [],
  usageTags: [],
  usageStatus: 'unassigned',
  transcript: null,
  inputMethod: 'manual',
});

/** "70" → 70、空欄 → null、それ以外（0以下・小数・範囲外・数字以外）→ undefined（エラー） */
export function parsePage(value: string): number | null | undefined {
  const s = value.normalize('NFKC').trim();
  if (!s) return null;
  if (!/^\d+$/.test(s)) return undefined;
  const n = Number(s);
  return n >= 1 && n <= LIMITS.pageMax ? n : undefined;
}

/** 保存条件（要件 SCR-05）: 登録済み書籍1件、引用またはコメントのいずれか、ページは任意 */
export function validateNoteDraft(
  d: NoteDraft,
  knownBookIds: ReadonlySet<string>,
): { ok: true; input: NoteInput; newTags: NewTag[] } | { ok: false; errors: NoteDraftErrors } {
  const errors: NoteDraftErrors = {};
  if (!d.bookId || !knownBookIds.has(d.bookId)) errors.bookId = copy.noteForm.bookRequired;

  const pageStart = parsePage(d.pageStart);
  const pageEnd = parsePage(d.pageEnd);
  if (pageStart === undefined) errors.pageStart = copy.noteForm.pageInvalid;
  if (pageEnd === undefined) errors.pageEnd = copy.noteForm.pageInvalid;
  else if (pageEnd !== null && pageStart === null) errors.pageEnd = copy.noteForm.pageEndNeedsStart;
  else if (pageEnd !== null && typeof pageStart === 'number' && pageEnd < pageStart) errors.pageEnd = copy.noteForm.pageRange;

  const quote = d.quote.trim();
  const comment = d.comment.trim();
  if (!quote && !comment) errors.body = copy.noteForm.bodyRequired;
  if (quote.length > LIMITS.quoteMax) errors.quote = copy.noteForm.tooLong(LIMITS.quoteMax);
  if (comment.length > LIMITS.commentMax) errors.comment = copy.noteForm.tooLong(LIMITS.commentMax);
  if (d.topicTags.length > LIMITS.tagIdsMax || d.usageTags.length > LIMITS.tagIdsMax) errors.tags = copy.noteForm.tooManyTags;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const newTags: NewTag[] = [
    ...d.topicTags.filter((t) => t.isNew).map((t) => ({ id: t.id, name: t.name, normalizedName: normalizeTagName(t.name), category: 'topic' as const })),
    ...d.usageTags.filter((t) => t.isNew).map((t) => ({ id: t.id, name: t.name, normalizedName: normalizeTagName(t.name), category: 'usage' as const })),
  ];
  const transcript = d.transcript?.slice(0, LIMITS.transcriptMax) ?? null;

  return {
    ok: true,
    newTags,
    input: {
      bookId: d.bookId,
      pageStart: pageStart ?? null,
      pageEnd: pageEnd ?? null,
      quote,
      comment,
      transcript,
      topicTagIds: [...new Set(d.topicTags.map((t) => t.id))],
      usageTagIds: [...new Set(d.usageTags.map((t) => t.id))],
      usageStatus: d.usageStatus,
      inputMethod: d.inputMethod,
    },
  };
}
