import { copy } from '../../app/copy';
import { googleBooksUrl } from './bookUtils';

/** Google Books の書籍ページへのリンク（Google Books API のブランディング規約）。Google 由来でなければ何も出さない。 */
export function GoogleBooksLink({ externalSourceId, className = '' }: { externalSourceId: string | null; className?: string }) {
  const url = googleBooksUrl(externalSourceId);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={`text-accent-strong ${className}`}>
      {copy.books.viewOnGoogleBooks}
    </a>
  );
}
