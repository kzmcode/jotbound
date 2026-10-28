import { Link } from 'react-router';
import { copy } from '../../app/copy';
import { MicIcon } from '../../components/icons';
import { TopBar } from '../../components/layout/TopBar';
import { GlassCard } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/Feedback';
import { ScreenTitle } from '../../components/ui/Typography';
import { formatRelativeDate } from '../../lib/date';
import { useBooks } from '../books/BooksProvider';
import { formatDuration } from '../recorder/recordingUtils';
import { useDrafts } from '../recorder/useDrafts';

/** 確認待ちの録音（端末内の下書き）の一覧 */
export function DraftsScreen() {
  const { drafts, loaded } = useDrafts();
  const { books } = useBooks();
  return (
    <>
      <TopBar />
      <ScreenTitle eyebrow={copy.drafts.eyebrow} title={copy.drafts.title} subtitle={copy.drafts.subtitle} />
      {loaded && drafts.length === 0 ? (
        <EmptyState icon={<MicIcon size={22} />} title={copy.drafts.empty} />
      ) : (
        <GlassCard className="px-4 py-1">
          <ul aria-label={copy.drafts.listLabel} className="m-0 list-none divide-y divide-border p-0">
            {drafts.map((d) => {
              const book = books.find((b) => b.id === d.bookId);
              const when = formatRelativeDate({ toDate: () => new Date(d.createdAt) });
              return (
                <li key={d.id}>
                  <Link to={`/review/${d.id}`} className="flex min-h-16 items-center gap-3 py-3 text-text no-underline">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-halo-outer text-accent-strong">
                      <MicIcon size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold">{copy.drafts.recordedAt(when)}</span>
                      <span className="block truncate text-[12px] text-text-secondary">
                        {[formatDuration(d.durationMs), book?.title].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="text-[13px] font-semibold text-accent-strong">{copy.drafts.open}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </GlassCard>
      )}
    </>
  );
}
