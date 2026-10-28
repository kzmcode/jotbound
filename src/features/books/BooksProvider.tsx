import { createCollectionContext, type CollectionState } from '../../lib/subscription';
import type { BookRecord } from '../../services/firebase/books';

export const loadBooksRepo = () => import('../../services/firebase/books');

const books = createCollectionContext<BookRecord>('useBooks', async () => (await loadBooksRepo()).subscribeBooks);

/** ログイン中ユーザーの本を購読し、各画面で共有する（端末キャッシュによりオフラインでも既取得分を表示）。 */
export const BooksProvider = books.Provider;

export type BooksState = CollectionState<BookRecord> & { books: BookRecord[] };

export function useBooks(): BooksState {
  const state = books.useCollection();
  return { ...state, books: state.items };
}
