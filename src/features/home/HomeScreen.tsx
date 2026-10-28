import { useMemo, useState } from 'react';
import { STALE_DRAFT_MS } from '../../app/config';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Notice } from '../../components/ui/Feedback';
import { deleteDrafts } from '../../storage/drafts';
import { BookChooser } from '../books/BookChooser';
import { useRecorder } from '../recorder/RecorderProvider';
import { useDrafts } from '../recorder/useDrafts';
import { useProfile } from '../settings/ProfileProvider';
import { Link, useNavigate } from 'react-router';
import { copy } from '../../app/copy';
import { ArrowRightIcon, ChevronRightIcon, NoteIcon, SparkleIcon } from '../../components/icons';
import { TopBar } from '../../components/layout/TopBar';
import { VoiceOrb } from '../../components/VoiceOrb';
import { GlassCard } from '../../components/ui/Card';
import { EmptyState, Skeleton } from '../../components/ui/Feedback';
import { useBooks } from '../books/BooksProvider';
import { NoteListItem } from '../notes/NoteListItem';
import { useNotes, useTags } from '../notes/NotesProvider';
import { SectionHeading } from '../../components/ui/Typography';

/** 確認待ちの下書きがあるときだけ表示する控えめな状態バー。 */
export function PendingReviewBar({ count, to, extracted = false }: { count: number; to: string; extracted?: boolean }) {
  if (count <= 0) return null;
  return (
    <Link
      to={to}
      className="glass mt-3 flex min-h-12 items-center gap-2 rounded-md px-4 text-[13px] text-text no-underline"
    >
      <SparkleIcon size={18} className="text-accent-strong" />
      <span className="flex-1">{extracted ? copy.home.pendingExtracted(count) : copy.home.pendingReview(count)}</span>
      <ChevronRightIcon size={18} className="text-text-secondary" />
    </Link>
  );
}

export function HomeScreen() {
  const navigate = useNavigate();
  const { status, notes } = useNotes();
  const { books } = useBooks();
  const { tagsById } = useTags();
  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  // 最近保存したメモ（直近5件。要件 SCR-01）
  const recent = useMemo(
    () => [...notes].sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)).slice(0, 5),
    [notes],
  );
  const recorder = useRecorder();
  const { profile, setPreferredBook } = useProfile();
  const { drafts } = useDrafts();
  const pendingTo = drafts.length === 1 ? `/review/${drafts[0]!.id}` : '/review';
  // 24時間以上前の未保存の下書きは整理を提案する（自動削除はしない。要件 FR-VOICE）
  const [now] = useState(() => Date.now());
  const stale = drafts.filter((d) => now - d.createdAt > STALE_DRAFT_MS);
  const [confirmStale, setConfirmStale] = useState(false);

  const startRecording = () => {
    // タップ操作の中で録音を開始してから録音画面へ（iOS の制約）
    recorder.start(profile?.preferredBookId ?? null);
    navigate('/record');
  };

  return (
    <>
      <TopBar />
      {stale.length > 0 && (
        <div className="mb-6">
          <Notice
            action={
              <div className="flex shrink-0 flex-col gap-1">
                <Button variant="ghost" className="min-h-9 px-3 text-[13px]" onClick={() => navigate('/review')}>
                  {copy.drafts.staleReview}
                </Button>
                <Button variant="ghost" className="min-h-9 px-3 text-[13px] !text-error" onClick={() => setConfirmStale(true)}>
                  {copy.drafts.staleDelete}
                </Button>
              </div>
            }
          >
            <p className="m-0 font-semibold">{copy.drafts.staleTitle(stale.length)}</p>
            <p className="m-0 mt-1 text-text-secondary">{copy.drafts.staleBody}</p>
          </Notice>
          <ConfirmDialog
            open={confirmStale}
            title={copy.drafts.staleDeleteTitle}
            confirmLabel={copy.drafts.staleDelete}
            cancelLabel={copy.review.cancel}
            destructive
            onCancel={() => setConfirmStale(false)}
            onConfirm={() => {
              setConfirmStale(false);
              void deleteDrafts(stale.map((d) => d.id));
            }}
          >
            <p className="m-0">{copy.drafts.staleDeleteBody(stale.length)}</p>
          </ConfirmDialog>
        </div>
      )}
      <section aria-labelledby="home-hero" className="text-center">
        <p className="eyebrow m-0" aria-hidden="true">
          {copy.home.eyebrow}
        </p>
        <h1 id="home-hero" lang="en" className="m-0 mt-2 text-[29px] font-semibold leading-[1.15] tracking-[-0.045em]">
          {copy.home.hero}
        </h1>
        <p className="m-0 mt-2 text-[13px] text-text-secondary">{copy.home.subcopy}</p>
        <div className="mt-7 mb-10">
          <VoiceOrb label={copy.home.voiceCta} helper={copy.home.voiceHelper} onActivate={startRecording} />
          <div className="mt-5">
            <BookChooser label={copy.home.bookLabel} value={profile?.preferredBookId ?? null} onChange={setPreferredBook} />
          </div>
        </div>
      </section>

      <section aria-labelledby="recent-heading">
        <SectionHeading
          id="recent-heading"
          action={
            <Link to="/notes" className="inline-flex min-h-11 items-center gap-1 rounded-sm text-[13px] font-medium text-accent-strong no-underline">
              {copy.home.viewAll}
              <ArrowRightIcon size={15} />
            </Link>
          }
        >
          {copy.home.recentHeading}
        </SectionHeading>
        {status === 'loading' && notes.length === 0 ? (
          <div className="flex flex-col gap-2" aria-hidden="true">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : recent.length === 0 ? (
          <EmptyState icon={<NoteIcon size={22} />} title={copy.home.empty} />
        ) : (
          <GlassCard className="px-4 py-1">
            <ul aria-label={copy.home.recentHeading} className="m-0 list-none divide-y divide-border p-0">
              {recent.map((n) => (
                <li key={n.id}>
                  <NoteListItem note={n} book={booksById.get(n.bookId)} tagsById={tagsById} />
                </li>
              ))}
            </ul>
          </GlassCard>
        )}
        <PendingReviewBar count={drafts.length} to={pendingTo} extracted={drafts.every((d) => d.analysis?.result)} />
      </section>
    </>
  );
}
