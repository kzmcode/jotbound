import type { NoteRecord } from '../../services/firebase/notes';
import type { TagRecord } from '../../services/firebase/tags';
import type { NoteDraft } from './noteDraft';

export function draftFromNote(n: NoteRecord, tagsById: ReadonlyMap<string, TagRecord>): NoteDraft {
  const toChoice = (id: string) => ({ id, name: tagsById.get(id)?.name ?? id, isNew: false });
  return {
    bookId: n.bookId,
    pageStart: n.pageStart?.toString() ?? '',
    pageEnd: n.pageEnd?.toString() ?? '',
    quote: n.quote,
    comment: n.comment,
    topicTags: n.topicTagIds.filter((id) => tagsById.has(id)).map(toChoice),
    usageTags: n.usageTagIds.filter((id) => tagsById.has(id)).map(toChoice),
    usageStatus: n.usageStatus,
    transcript: n.transcript,
    inputMethod: n.inputMethod,
  };
}
