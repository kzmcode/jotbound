import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useSessionUser } from '../../app/auth';
import { copy } from '../../app/copy';
import { FlowHeader } from '../../components/layout/FlowHeader';
import { useOnline } from '../../components/layout/StatusBanners';
import { Button, ButtonLink } from '../../components/ui/Button';
import { SurfaceCard } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, Notice, Skeleton } from '../../components/ui/Feedback';
import { ScreenTitle } from '../../components/ui/Typography';
import { hasAiConsent, setAiConsent } from '../../lib/aiConsent';
import { newDocId } from '../../lib/id';
import { loadExtractionProvider } from '../../services/ai';
import { classifyAIError } from '../../services/ai/errors';
import type { ExtractionErrorKind } from '../../services/ai/types';
import { deleteDraft, getDraft, updateDraft, type AudioDraft, type DraftAnalysis } from '../../storage/drafts';
import { useBooks } from '../books/BooksProvider';
import { NoteForm } from '../notes/NoteForm';
import { emptyNoteDraft, validateNoteDraft, type NoteDraft, type NoteDraftErrors } from '../notes/noteDraft';
import { loadNotesRepo, useNotes, useTags } from '../notes/NotesProvider';
import { formatDuration } from '../recorder/recordingUtils';
import { useProfile } from '../settings/ProfileProvider';
import { AnalysisConsent, AnalysisFailed, AnalysisProgress, ExtractionNotices } from './AnalysisPanels';
import { extractionContext, reviewFromExtraction, type ExtractionReview } from './extractionDraft';

type Loaded = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; draft: AudioDraft; url: string };
type Phase =
  /** 開いた直後（自動解析の開始待ち） */
  | { kind: 'init' }
  | { kind: 'consent' }
  | { kind: 'analyzing'; step: number }
  | { kind: 'failed'; error: ExtractionErrorKind }
  | { kind: 'form' };

/** 下書きの保存状態から最初の表示を決める。'auto' は自動で1回だけ解析する */
function initialPhase(draft: AudioDraft, online: boolean): Phase | 'auto' {
  if (draft.form || draft.analysis?.result) return { kind: 'form' };
  // 一度でも送信していれば自動では再送しない（無限自動再試行の禁止）
  if (draft.analysis && draft.analysis.attempts > 0) return { kind: 'failed', error: draft.analysis.lastError ?? 'failed' };
  if (!hasAiConsent() || !online) return { kind: 'consent' };
  return 'auto';
}

/** 本の登録画面から戻ったときに受け取る値 */
type ReturnState = { newBookId?: string } | null;

/**
 * AI 抽出結果の確認・保存（要件 SCR-05）。
 * 録音 → （初回のみ説明）→ AI 解析を1回 → 書籍・タグの照合 → 利用者が確認・修正 → 保存。
 * 保存ボタンを押すまで Firestore に正式なメモを作らない。解析に失敗しても自動では再試行しない。
 */
export function ReviewScreen() {
  const { draftId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useSessionUser();
  const online = useOnline();
  const { books, status: booksStatus } = useBooks();
  const { tags } = useTags();
  const { notes } = useNotes();
  const { profile, setPreferredBook } = useProfile();
  const bookIds = useMemo(() => new Set(books.map((b) => b.id)), [books]);
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [phase, setPhase] = useState<Phase | null>(null);
  const [form, setForm] = useState<NoteDraft | null>(null);
  const [errors, setErrors] = useState<NoteDraftErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmReanalyze, setConfirmReanalyze] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const autoStarted = useRef(false);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    const newBookId = (location.state as ReturnState)?.newBookId;
    void getDraft(draftId, user.uid)
      .then((draft) => {
        if (cancelled) return;
        if (!draft) return setLoaded({ status: 'missing' });
        url = URL.createObjectURL(draft.audio);
        setLoaded({ status: 'ready', draft, url });
        if (draft.form) setForm(newBookId ? { ...draft.form, bookId: newBookId } : draft.form);
      })
      .catch(() => !cancelled && setLoaded({ status: 'missing' }));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // location.state は下書きを開いた時点の値だけを使う
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  // 画面を離れたら進行中のリクエストを中断する（送信済みの分は無料枠を消費する）
  useEffect(() => () => abortRef.current?.abort(), []);

  const draft = loaded.status === 'ready' ? loaded.draft : null;
  const analysis = draft?.analysis;
  const result = analysis?.result ?? null;
  const selectedBookId = draft ? (draft.bookId ?? profile?.preferredBookId ?? null) : null;

  const patchDraft = useCallback(async (patch: Partial<AudioDraft>) => {
    setLoaded((l) => (l.status === 'ready' ? { ...l, draft: { ...l.draft, ...patch } } : l));
    await updateDraft(draftId, patch).catch(() => {});
  }, [draftId]);

  const analyze = useCallback(async () => {
    if (!draft) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const attempts = (draft.analysis?.attempts ?? 0) + 1;
    const record = (a: Omit<DraftAnalysis, 'attempts' | 'updatedAt'>) =>
      patchDraft({ analysis: { attempts, updatedAt: Date.now(), ...a } });
    setPhase({ kind: 'analyzing', step: 0 });
    setError(null);
    // 送信前に回数を記録する（途中でアプリが閉じても、次回は自動で再送しない）
    await record({ result: draft.analysis?.result ?? null, lastError: 'aborted' });
    try {
      const provider = await loadExtractionProvider();
      const memo = await provider.extract({
        audio: draft.audio,
        mimeType: draft.mimeType,
        ...extractionContext(books, notes, tags, selectedBookId),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setPhase({ kind: 'analyzing', step: 1 });
      await record({ result: memo, lastError: null });
      setPhase({ kind: 'analyzing', step: 2 });
      // 新しい結果で入力欄を置き換える（再解析の確認で説明済み）
      setForm(null);
      await patchDraft({ form: null });
      setErrors({});
      setPhase({ kind: 'form' });
    } catch (e) {
      const kind = classifyAIError(e, navigator.onLine);
      await record({ result: draft.analysis?.result ?? null, lastError: kind });
      if (controller.signal.aborted || kind === 'aborted') setPhase({ kind: 'form' });
      else setPhase({ kind: 'failed', error: kind });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [books, draft, notes, patchDraft, selectedBookId, tags]);

  // 開いた時点の状態から表示を決める。未解析なら（説明に同意済み・オンラインのとき）1回だけ自動で解析する
  const initial = draft ? initialPhase(draft, online) : null;
  useEffect(() => {
    if (phase || initial !== 'auto' || booksStatus === 'loading' || autoStarted.current) return;
    autoStarted.current = true;
    void analyze();
  }, [analyze, booksStatus, initial, phase]);
  const shown: Phase = phase ?? (initial && initial !== 'auto' ? initial : { kind: 'init' });

  const review = useMemo(
    () => (result ? reviewFromExtraction(result, books, tags, selectedBookId) : null),
    [books, result, selectedBookId, tags],
  );

  if (!draft || loaded.status !== 'ready') {
    return (
      <>
        <FlowHeader eyebrow={copy.review.eyebrow} backLabel={copy.review.back} />
        {loaded.status === 'loading' ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : (
          <EmptyState
            title={copy.review.notFound}
            hint={copy.review.notFoundHint}
            action={
              <ButtonLink to="/" variant="secondary">
                {copy.nav.home}
              </ButtonLink>
            }
          />
        )}
      </>
    );
  }

  const fallbackBook = selectedBookId && bookIds.has(selectedBookId) ? selectedBookId : '';
  const draftForm: NoteDraft = form ?? review?.form ?? { ...emptyNoteDraft(fallbackBook), inputMethod: 'voice' };

  const save = async () => {
    const validated = validateNoteDraft(draftForm, bookIds);
    if (!validated.ok) {
      setErrors(validated.errors);
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
      // 下書きごとに固定の noteId を使うため、再送しても重複しない（既に保存済みなら 'exists'）
      await repo.saveNewNote(user.uid, draft.noteId, validated.input, validated.newTags);
      await deleteDraft(draft.id).catch(() => {});
      setPreferredBook(validated.input.bookId);
      navigate(`/notes/${draft.noteId}`, { replace: true, state: { saved: true } });
    } catch {
      setError(copy.noteForm.saveError);
      setBusy(false);
    }
  };

  const later = async () => {
    if (shown.kind === 'form') await patchDraft({ form: draftForm });
    navigate('/');
  };

  const registerBook = async (title: string) => {
    await patchDraft({ form: draftForm });
    navigate('/books/new', { state: { title, returnTo: `/review/${draft.id}` } });
  };

  const agree = () => {
    setAiConsent(true);
    void analyze();
  };

  const audioCard = (
    <SurfaceCard className="flex flex-col gap-2 p-4">
      <p className="m-0 text-[13px] font-semibold">
        {copy.review.audio}
        <span className="ml-2 font-normal text-text-secondary">{copy.review.duration(formatDuration(draft.durationMs))}</span>
      </p>
      <audio controls src={loaded.url} preload="metadata" className="w-full" aria-label={copy.review.audio} />
      <p className="m-0 text-[12px] text-text-secondary">{copy.review.deviceOnly}</p>
    </SurfaceCard>
  );
  const stopNotice = draft.stopReason !== 'user' && <Notice live="polite">{copy.record.stopped[draft.stopReason]}</Notice>;
  const header = <FlowHeader eyebrow={copy.review.eyebrow} backLabel={copy.review.back} onBack={() => navigate('/')} />;

  if (shown.kind !== 'form') {
    return (
      <>
        {header}
        <ScreenTitle eyebrow={copy.review.steps} title={copy.review.title} subtitle={copy.review.helper} />
        <div className="flex flex-col gap-4">
          {stopNotice}
          {shown.kind === 'init' && <Skeleton className="h-48 w-full rounded-lg" />}
          {shown.kind === 'consent' && <AnalysisConsent onAgree={agree} onManual={() => setPhase({ kind: 'form' })} disabled={!online} />}
          {shown.kind === 'analyzing' && <AnalysisProgress step={shown.step} onCancel={() => abortRef.current?.abort()} />}
          {shown.kind === 'failed' && (
            <AnalysisFailed
              kind={shown.error}
              attempts={analysis?.attempts ?? 0}
              online={online}
              onRetry={() => void analyze()}
              onManual={() => setPhase({ kind: 'form' })}
            />
          )}
          {audioCard}
        </div>
      </>
    );
  }

  // 利用者が本を選び直すまで、照合結果の案内を表示する
  const bookNotice =
    review && result && draftForm.bookId === review.form.bookId ? (
      <BookMatchNotice
        review={review}
        mention={result.bookMention ?? ''}
        books={books}
        onPick={(bookId) => setForm({ ...draftForm, bookId })}
        onRegister={(title) => void registerBook(title)}
      />
    ) : null;
  const before = (
    <>
      {stopNotice}
      {result ? (
        <ExtractionNotices memo={result} />
      ) : (
        <Notice
          action={
            online ? (
              <Button variant="ghost" className="min-h-9 shrink-0 px-3 text-[13px]" onClick={() => (hasAiConsent() ? void analyze() : setPhase({ kind: 'consent' }))}>
                {copy.review.analyzeNow}
              </Button>
            ) : undefined
          }
        >
          {online ? copy.review.helperManual : copy.review.offlineAnalysis}
        </Notice>
      )}
      {audioCard}
    </>
  );

  return (
    <>
      {header}
      <ScreenTitle eyebrow={copy.review.steps} title={copy.review.title} subtitle={result ? copy.review.helper : copy.review.helperManual} />
      <NoteForm
        draft={draftForm}
        errors={errors}
        onChange={setForm}
        books={books}
        tags={tags}
        createTagId={newDocId}
        onSubmit={() => void save()}
        submitLabel={copy.review.save}
        busyLabel={copy.noteForm.saving}
        busy={busy}
        error={error}
        before={before}
        bookNotice={bookNotice}
        tagProposals={review?.proposals}
        secondaryAction={
          <div className="grid grid-cols-2 gap-2">
            {result && (
              <Button variant="secondary" onClick={() => setConfirmReanalyze(true)} disabled={busy || !online} className="col-span-2">
                {copy.review.reanalyze}
              </Button>
            )}
            <Button variant="secondary" onClick={() => void later()} disabled={busy}>
              {copy.review.later}
            </Button>
            <Button variant="secondary" onClick={() => setConfirmDiscard(true)} disabled={busy} className="!text-error">
              {copy.review.discard}
            </Button>
          </div>
        }
      />
      <ConfirmDialog
        open={confirmReanalyze}
        title={copy.review.reanalyzeTitle}
        confirmLabel={copy.review.reanalyzeConfirm}
        cancelLabel={copy.review.cancel}
        onCancel={() => setConfirmReanalyze(false)}
        onConfirm={() => {
          setConfirmReanalyze(false);
          void analyze();
        }}
      >
        {copy.review.reanalyzeBody.map((p) => (
          <p key={p} className="m-0">
            {p}
          </p>
        ))}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmDiscard}
        title={copy.review.discardTitle}
        confirmLabel={copy.review.discardConfirm}
        cancelLabel={copy.review.cancel}
        destructive
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          void deleteDraft(draft.id).finally(() => navigate('/', { replace: true }));
        }}
      >
        <p className="m-0">{copy.review.discardBody}</p>
      </ConfirmDialog>
    </>
  );
}

/** 書名照合の結果。一意に決まらないときは利用者に選ばせる（自動で決めない） */
function BookMatchNotice({
  review,
  mention,
  books,
  onPick,
  onRegister,
}: {
  review: ExtractionReview;
  mention: string;
  books: readonly { id: string; title: string }[];
  onPick: (bookId: string) => void;
  onRegister: (title: string) => void;
}) {
  const b = copy.review.book;
  const { bookMatch: m } = review;
  const title = (id: string) => books.find((x) => x.id === id)?.title ?? '';
  const hint = (text: string) => (
    <p className="-mt-2 m-0 text-[12px] text-text-secondary" data-testid="book-match" data-kind={m.kind}>
      {text}
    </p>
  );
  switch (m.kind) {
    case 'exact':
    case 'partial':
      return hint(`${m.kind === 'exact' ? b.exact(title(m.bookId)) : b.partial(title(m.bookId))}${review.bookDiffersFromSelected ? ` ${b.differs}` : ''}`);
    case 'noMention':
      return hint(review.form.bookId ? b.noMention : b.noMentionEmpty);
    case 'ambiguous':
      return (
        <div className="-mt-2 flex flex-col gap-2" data-testid="book-match" data-kind={m.kind}>
          <Notice tone="error">{b.ambiguous(mention)}</Notice>
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {m.bookIds.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onPick(id)}
                  className="inline-flex min-h-9 items-center rounded-pill border border-border bg-surface-subtle px-3 text-[13px] hover:border-accent"
                >
                  {title(id)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      );
    case 'none':
      return (
        <div className="-mt-2" data-testid="book-match" data-kind={m.kind}>
          <Notice
            tone="error"
            action={
              <Button variant="ghost" className="min-h-9 shrink-0 px-3 text-[13px]" onClick={() => onRegister(mention)}>
                {b.register}
              </Button>
            }
          >
            {b.none(mention)}
          </Notice>
        </div>
      );
  }
}
