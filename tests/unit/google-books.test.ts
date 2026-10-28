import { afterEach, describe, expect, it, vi } from 'vitest';
import { BooksSearchError, searchGoogleBooks, toCandidate } from '../../src/services/books/googleBooks';

afterEach(() => vi.unstubAllGlobals());

const volume = {
  id: 'abc',
  volumeInfo: {
    title: '静かな読書の技法',
    authors: ['霧島透'],
    publisher: '日本評論社',
    industryIdentifiers: [
      { type: 'ISBN_10', identifier: '4003101014' },
      { type: 'OTHER', identifier: 'x' },
    ],
    imageLinks: { thumbnail: 'http://books.google.com/books/content?id=abc&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api' },
  },
};

describe('toCandidate', () => {
  it('Google Books の結果を候補に変換し、書影を https 化する', () => {
    expect(toCandidate(volume)).toEqual({
      externalSourceId: 'google:abc',
      title: '静かな読書の技法',
      authors: ['霧島透'],
      publisher: '日本評論社',
      isbn13: '9784003101018',
      coverUrl: 'https://books.google.com/books/content?id=abc&printsec=frontcover&img=1&zoom=1&source=gbs_api',
      coverProvider: 'google',
    });
  });

  it('書影がなければ none、書名がなければ除外', () => {
    expect(toCandidate({ id: 'x', volumeInfo: { title: 'T' } })).toMatchObject({ coverUrl: null, coverProvider: 'none', isbn13: null });
    expect(toCandidate({ id: 'y', volumeInfo: {} })).toBeNull();
  });
});

describe('searchGoogleBooks', () => {
  it('ISBN 検索のクエリを組み立てる', async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ items: [volume] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const results = await searchGoogleBooks({ isbn: '9784003101018' }, 'KEY');
    expect(results).toHaveLength(1);
    const url = new URL(fetchMock.mock.calls[0]![0]);
    expect(url.searchParams.get('q')).toBe('isbn:9784003101018');
    expect(url.searchParams.get('key')).toBe('KEY');
  });

  it('キー未設定・上限・通信エラーを区別する', async () => {
    await expect(searchGoogleBooks({ title: 'x' }, null)).rejects.toMatchObject({ kind: 'notConfigured' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429 })));
    await expect(searchGoogleBooks({ title: 'x' }, 'K')).rejects.toMatchObject({ kind: 'quota' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(searchGoogleBooks({ title: 'x' }, 'K')).rejects.toBeInstanceOf(BooksSearchError);
    await expect(searchGoogleBooks({ title: 'x' }, 'K')).rejects.toMatchObject({ kind: 'network' });
  });

  it('書名は通常の検索語として送る（intitle: は付けない）', async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await searchGoogleBooks({ title: '静かな読書の技法' }, 'K');
    expect(new URL(fetchMock.mock.calls[0]![0]).searchParams.get('q')).toBe('静かな読書の技法');
  });

  it('結果なしは空配列', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    expect(await searchGoogleBooks({ title: 'なし' }, 'K')).toEqual([]);
  });
});
