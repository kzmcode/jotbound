import { render } from '@testing-library/react';
import { Timestamp } from 'firebase/firestore';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { AuthContext, type AuthState } from '../../src/app/auth';
import { routes } from '../../src/app/routes';
import type { BookRecord } from '../../src/services/firebase/books';
import type { NoteRecord } from '../../src/services/firebase/notes';
import type { TagRecord } from '../../src/services/firebase/tags';

export const testUser = { uid: 'uid123', displayName: '鈴木', email: 'owner@example.com', photoURL: null };
export const authActions = { signIn: vi.fn(async () => {}), signOut: vi.fn(async () => {}) };

export function makeBook(over: Partial<BookRecord> = {}): BookRecord {
  return {
    id: 'b1',
    title: '静かな読書の技法',
    titleNormalized: '静かな読書の技法',
    aliases: [],
    authors: ['霧島透'],
    isbn13: '9784003101018',
    publisher: '日本評論社',
    coverUrl: null,
    coverProvider: 'none',
    externalSourceId: null,
    readingStatus: 'reading',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...over,
  };
}

export function makeNote(over: Partial<NoteRecord> = {}): NoteRecord {
  return {
    id: 'n1',
    bookId: 'b1',
    pageStart: 70,
    pageEnd: null,
    quote: '読みかけの本のほうが、考えを遠くまで運んでくれる',
    comment: '次の授業の参考にしたい。',
    transcript: null,
    topicTagIds: [],
    usageTagIds: [],
    usageStatus: 'planned',
    inputMethod: 'voice',
    createdAt: Timestamp.fromDate(new Date('2026-10-20T10:00:00')),
    updatedAt: Timestamp.fromDate(new Date('2026-10-20T10:00:00')),
    schemaVersion: 1,
    ...over,
  };
}

export function makeTag(over: Partial<TagRecord> = {}): TagRecord {
  return {
    id: 't1',
    name: '教育',
    normalizedName: '教育',
    category: 'topic',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...over,
  };
}

export function renderAt(path: string, state: AuthState = { status: 'signedIn', user: testUser }) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AuthContext.Provider value={{ state, ...authActions }}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  );
  return router;
}
