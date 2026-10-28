import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { resetMocks } from './mockRepos';

// jsdom は <dialog> のモーダル表示に未対応のため最小限を補う
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
}

// Node の URL.createObjectURL は jsdom の Blob を受け付けないため置き換える
URL.createObjectURL = () => 'blob:test';
URL.revokeObjectURL = () => {};

// Firebase に接続しないよう、データ層はすべて mockRepos に差し替える
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({ needRefresh: [false, () => {}], offlineReady: [false, () => {}], updateServiceWorker: () => {} }),
}));
vi.mock('../../src/services/firebase/books', async () => {
  const { mockDb, mockRepo, subscribeOnce } = await import('./mockRepos');
  return {
    subscribeBooks: subscribeOnce(() => mockDb.books),
    createBook: mockRepo.createBook,
    updateBook: mockRepo.updateBook,
    deleteBook: mockRepo.deleteBook,
    countNotesForBook: mockRepo.countNotesForBook,
  };
});
vi.mock('../../src/services/firebase/notes', async () => {
  const { mockDb, mockRepo, subscribeOnce } = await import('./mockRepos');
  return {
    subscribeNotes: subscribeOnce(() => mockDb.notes),
    saveNewNote: mockRepo.saveNewNote,
    updateNote: mockRepo.updateNote,
    deleteNote: mockRepo.deleteNote,
    moveNote: mockRepo.moveNote,
  };
});
vi.mock('../../src/services/firebase/tags', async () => {
  const { mockDb, mockRepo, subscribeOnce } = await import('./mockRepos');
  return {
    subscribeTags: subscribeOnce(() => mockDb.tags),
    createTag: mockRepo.createTag,
    renameTag: mockRepo.renameTag,
    mergeTag: mockRepo.mergeTag,
    deleteTag: mockRepo.deleteTag,
  };
});
vi.mock('../../src/services/firebase/profile', async () => {
  const { mockDb, mockRepo } = await import('./mockRepos');
  return {
    subscribeProfile: (_uid: string, onData: (p: unknown) => void) => {
      onData(mockDb.profile);
      return () => {};
    },
    setPreferredBook: mockRepo.setPreferredBook,
  };
});
vi.mock('../../src/services/firebase/backup', async () => {
  const { mockRepo } = await import('./mockRepos');
  return { applyImport: mockRepo.applyImport };
});
vi.mock('../../src/services/ai', async () => {
  const { mockAI } = await import('./mockRepos');
  return { loadExtractionProvider: async () => mockAI };
});
// 安全網: モックし忘れたデータ層があっても本物の Firebase に接続しない
vi.mock('../../src/services/firebase/app', () => ({
  getFirebase: () => {
    throw new Error('Unit テストで本物の Firebase を初期化しようとしました。tests/unit/setup.ts にモックを追加してください。');
  },
}));
// jsdom では画像が読み込まれないため、書影の確認は「なし」を返す
vi.mock('../../src/services/books/covers', () => ({
  resolveCover: async () => ({ coverUrl: null, coverProvider: 'none' }),
}));

beforeEach(() => resetMocks());

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});
