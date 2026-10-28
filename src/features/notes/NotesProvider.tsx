import { useMemo } from 'react';
import { createCollectionContext, type CollectionState } from '../../lib/subscription';
import type { NoteRecord } from '../../services/firebase/notes';
import type { TagRecord } from '../../services/firebase/tags';

export const loadNotesRepo = () => import('../../services/firebase/notes');
export const loadTagsRepo = () => import('../../services/firebase/tags');

const notes = createCollectionContext<NoteRecord>('useNotes', async () => (await loadNotesRepo()).subscribeNotes);
const tags = createCollectionContext<TagRecord>('useTags', async () => (await loadTagsRepo()).subscribeTags);

/**
 * メモとタグを購読して共有する。個人用途（1万件未満）を想定し、全件を端末にキャッシュして
 * 検索・絞り込みは端末内で行う（要件 SCR-06・9章）。
 */
export const NotesProvider = notes.Provider;
export const TagsProvider = tags.Provider;

export function useNotes(): CollectionState<NoteRecord> & { notes: NoteRecord[] } {
  const state = notes.useCollection();
  return { ...state, notes: state.items };
}

export function useTags() {
  const state = tags.useCollection();
  const tagsById = useMemo(() => new Map(state.items.map((t) => [t.id, t])), [state.items]);
  return { ...state, tags: state.items, tagsById };
}
