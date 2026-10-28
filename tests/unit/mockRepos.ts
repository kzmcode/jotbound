import { vi } from 'vitest';
import type { BookRecord } from '../../src/services/firebase/books';
import type { NoteRecord } from '../../src/services/firebase/notes';
import type { TagRecord } from '../../src/services/firebase/tags';
import type { Profile } from '../../src/types/models';

/** Unit テスト用の Firestore 代替。setup.ts で全テストに適用する。 */
export const mockDb = {
  books: [] as BookRecord[],
  notes: [] as NoteRecord[],
  tags: [] as TagRecord[],
  profile: null as Profile | null,
};

export const mockRepo = {
  createBook: vi.fn(async (..._a: unknown[]) => 'new1'),
  updateBook: vi.fn(async (..._a: unknown[]) => {}),
  deleteBook: vi.fn(async (..._a: unknown[]) => {}),
  countNotesForBook: vi.fn(async (..._a: unknown[]) => 0),
  saveNewNote: vi.fn(async (..._a: unknown[]) => 'created' as const),
  updateNote: vi.fn(async (..._a: unknown[]) => {}),
  deleteNote: vi.fn(async (..._a: unknown[]) => {}),
  moveNote: vi.fn(async (..._a: unknown[]) => {}),
  createTag: vi.fn(async (..._a: unknown[]) => 'tagNew'),
  renameTag: vi.fn(async (..._a: unknown[]) => {}),
  mergeTag: vi.fn(async (..._a: unknown[]) => {}),
  deleteTag: vi.fn(async (..._a: unknown[]) => {}),
  setPreferredBook: vi.fn(async (..._a: unknown[]) => {}),
  applyImport: vi.fn(async (..._a: unknown[]) => {}),
};

/** AI 抽出の代替（Unit テストでは Firebase AI Logic を呼ばない） */
export const mockAI = {
  extract: vi.fn(async (..._a: unknown[]): Promise<unknown> => {
    throw new Error('mockAI.extract の戻り値をテストで設定してください');
  }),
  checkConnection: vi.fn(async () => {}),
};

export function resetMocks() {
  mockAI.extract.mockReset();
  mockAI.checkConnection.mockReset();
  mockDb.books = [];
  mockDb.notes = [];
  mockDb.tags = [];
  mockDb.profile = null;
  for (const fn of Object.values(mockRepo)) fn.mockClear();
  mockRepo.countNotesForBook.mockResolvedValue(0);
}

export const subscribeOnce =
  <T>(get: () => T[]) =>
  (_uid: string, onData: (items: T[]) => void) => {
    onData(get());
    return () => {};
  };
