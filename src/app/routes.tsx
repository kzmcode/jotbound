import type { RouteObject } from 'react-router';
import { FlowLayout, TabLayout } from '../components/layout/AppShell';
import { AuthGate } from '../features/auth/AuthGate';
import { BookDetailScreen } from '../features/books/BookDetailScreen';
import { BookNewScreen } from '../features/books/BookNewScreen';
import { BooksScreen } from '../features/books/BooksScreen';
import { HomeScreen } from '../features/home/HomeScreen';
import { NoteDetailScreen } from '../features/notes/NoteDetailScreen';
import { NoteNewScreen } from '../features/notes/NoteNewScreen';
import { NotesScreen } from '../features/notes/NotesScreen';
import { RecordScreen } from '../features/recorder/RecordScreen';
import { DraftsScreen } from '../features/review/DraftsScreen';
import { ReviewScreen } from '../features/review/ReviewScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { NotFoundScreen } from './NotFoundScreen';

/** 要件定義書 2章の画面構成 */
export const routes: RouteObject[] = [
  {
    element: <AuthGate />,
    children: [
  {
    element: <TabLayout />,
    children: [
      { index: true, element: <HomeScreen /> },
      { path: 'books', element: <BooksScreen /> },
      { path: 'books/new', element: <BookNewScreen /> },
      { path: 'books/:bookId', element: <BookDetailScreen /> },
      { path: 'notes', element: <NotesScreen /> },
      { path: 'notes/new', element: <NoteNewScreen /> },
      { path: 'notes/:noteId', element: <NoteDetailScreen /> },
      { path: 'settings', element: <SettingsScreen /> },
      { path: 'review', element: <DraftsScreen /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
  {
    element: <FlowLayout />,
    children: [
      { path: 'record', element: <RecordScreen /> },
      { path: 'review/:draftId', element: <ReviewScreen /> },
    ],
  },
    ],
  },
];
