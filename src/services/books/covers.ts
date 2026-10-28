import { openLibraryCoverUrl } from '../../features/books/bookUtils';
import type { CoverProvider } from '../../types/models';

/** 画像が読み込めるか確認する（CORS 不要）。Open Library は default=false で未登録時 404 を返す。 */
export function probeImage(url: string, timeoutMs = 6000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(false), timeoutMs);
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      clearTimeout(timer);
      resolve(img.naturalWidth > 1);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    img.src = url;
  });
}

/** 書影の優先順位: Google Books → Open Library → なし（代替表紙） */
export async function resolveCover(
  current: { coverUrl: string | null; coverProvider: CoverProvider },
  isbn13: string | null,
): Promise<{ coverUrl: string | null; coverProvider: CoverProvider }> {
  if (current.coverUrl && current.coverProvider === 'google') return current;
  if (isbn13) {
    const url = openLibraryCoverUrl(isbn13);
    if (await probeImage(url)) return { coverUrl: url, coverProvider: 'openlibrary' };
  }
  return { coverUrl: null, coverProvider: 'none' };
}
