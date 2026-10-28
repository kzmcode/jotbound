import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useSessionUser } from '../../app/auth';
import { copy } from '../../app/copy';
import { FlowHeader } from '../../components/layout/FlowHeader';
import { useOnline } from '../../components/layout/StatusBanners';
import { ScreenTitle } from '../../components/ui/Typography';
import { newDocId } from '../../lib/id';
import { useBooks } from '../books/BooksProvider';
import { NoteForm } from './NoteForm';
import { emptyNoteDraft, validateNoteDraft, type NoteDraft, type NoteDraftErrors } from './noteDraft';
import { loadNotesRepo, useTags } from './NotesProvider';

/** 手入力でメモを作成（音声・AI が使えないときの代替。要件 FR-VOICE） */
export function NoteNewScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const user = useSessionUser();
  const online = useOnline();
  const { books } = useBooks();
  const { tags } = useTags();
  const bookIds = useMemo(() => new Set(books.map((b) => b.id)), [books]);
  // 画面を開いた時点で ID を決め、二重送信・再送でも同じ ID で保存する
  const [noteId] = useState(newDocId);
  const [draft, setDraft] = useState<NoteDraft>(() => emptyNoteDraft(params.get('bookId') ?? ''));
  const [errors, setErrors] = useState<NoteDraftErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const result = validateNoteDraft(draft, bookIds);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    if (!online) {
      setError(copy.noteForm.offlineSave);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const repo = await loadNotesRepo();
      await repo.saveNewNote(user.uid, noteId, result.input, result.newTags);
      navigate(`/notes/${noteId}`, { replace: true, state: { saved: true } });
    } catch {
      setError(copy.noteForm.saveError);
      setBusy(false);
    }
  };

  return (
    <>
      <FlowHeader eyebrow={copy.noteForm.newEyebrow} backLabel={copy.review.back} />
      <ScreenTitle title={copy.noteForm.newTitle} subtitle={copy.noteForm.newSubtitle} />
      <NoteForm
        draft={draft}
        errors={errors}
        onChange={setDraft}
        books={books}
        tags={tags}
        createTagId={newDocId}
        onSubmit={() => void submit()}
        submitLabel={copy.noteForm.save}
        busyLabel={copy.noteForm.saving}
        busy={busy}
        error={error}
      />
    </>
  );
}
