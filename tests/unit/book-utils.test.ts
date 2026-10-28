import { describe, expect, it } from 'vitest';
import { validateDraft, emptyDraft } from '../../src/features/books/bookDraft';
import {
  findPossibleDuplicates,
  googleBooksUrl,
  isTrustedCoverUrl,
  isValidIsbn13,
  normalizeIsbn,
  normalizeTitle,
  splitList,
} from '../../src/features/books/bookUtils';

describe('normalizeTitle', () => {
  it('全角/半角・大小文字・空白・記号の違いを吸収する', () => {
    expect(normalizeTitle('Ｒｅａｃｔ 入門　第２版')).toBe(normalizeTitle('react入門 第2版'));
    expect(normalizeTitle('『静かな読書の技法』')).toBe('静かな読書の技法');
  });

  it('カタカナをひらがなに寄せ、音声認識の表記揺れを減らす', () => {
    expect(normalizeTitle('アイデアの余白')).toBe(normalizeTitle('あいであの余白'));
  });

  it('200文字に切り詰める', () => {
    expect(normalizeTitle('あ'.repeat(300))).toHaveLength(200);
  });
});

describe('ISBN', () => {
  it('ISBN-13 のチェックディジットを検証する', () => {
    expect(isValidIsbn13('9784003101018')).toBe(true);
    expect(isValidIsbn13('9784003101019')).toBe(false);
  });

  it('ハイフン・全角を許容し、ISBN-10 を ISBN-13 に変換する', () => {
    expect(normalizeIsbn('978-4-00-310101-8')).toBe('9784003101018');
    expect(normalizeIsbn('４００３１０１０１４')).toBe('9784003101018');
    expect(normalizeIsbn('4-00-310101-4')).toBe('9784003101018');
    expect(normalizeIsbn('4535563950')).toBe('9784535563957');
  });

  it('不正な ISBN は null', () => {
    expect(normalizeIsbn('4003101015')).toBeNull();
    expect(normalizeIsbn('12345')).toBeNull();
    expect(normalizeIsbn('')).toBeNull();
  });
});

describe('isTrustedCoverUrl', () => {
  it('Google Books / Open Library の https のみ許可', () => {
    expect(isTrustedCoverUrl('https://books.google.com/books/content?id=x')).toBe(true);
    expect(isTrustedCoverUrl('https://covers.openlibrary.org/b/isbn/1-M.jpg')).toBe(true);
    expect(isTrustedCoverUrl('http://books.google.com/x')).toBe(false);
    expect(isTrustedCoverUrl('https://books.google.com.evil.example/x')).toBe(false);
    expect(isTrustedCoverUrl('javascript:alert(1)')).toBe(false);
    expect(isTrustedCoverUrl(null)).toBe(false);
  });
});

describe('splitList / 重複検出', () => {
  it('「、」「,」改行で区切り、空要素と重複を除く', () => {
    expect(splitList('霧島透、 霧島透,,山田\n', 20)).toEqual(['霧島透', '山田']);
    expect(splitList('a,b,c', 2)).toEqual(['a', 'b']);
  });

  it('同じ ISBN または正規化した書名が一致する本を候補にする', () => {
    const books = [
      { id: '1', title: 'アイデアの余白', isbn13: null },
      { id: '2', title: '別の本', isbn13: '9784003101018' },
    ];
    expect(findPossibleDuplicates(books, { title: 'あいであの余白', isbn13: null }).map((b) => b.id)).toEqual(['1']);
    expect(findPossibleDuplicates(books, { title: '新しい本', isbn13: '9784003101018' }).map((b) => b.id)).toEqual(['2']);
    expect(findPossibleDuplicates(books, { title: '別の本', isbn13: null }, '2')).toEqual([]);
  });
});

describe('validateDraft', () => {
  it('書名は必須・ISBN は形式チェック', () => {
    const r = validateDraft({ ...emptyDraft, title: '  ', isbn: '123' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.title).toBeTruthy();
      expect(r.errors.isbn).toBeTruthy();
    }
  });

  it('Firestore の形式に変換する（空欄は null、信頼できない書影は捨てる）', () => {
    const r = validateDraft({
      ...emptyDraft,
      title: ' 静かな読書の技法 ',
      authors: '霧島透',
      isbn: '4-00-310101-4',
      aliases: '読書の技法、静かな',
      coverUrl: 'https://tracker.example.com/x.png',
      coverProvider: 'manual',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input).toMatchObject({
        title: '静かな読書の技法',
        titleNormalized: '静かな読書の技法',
        authors: ['霧島透'],
        isbn13: '9784003101018',
        aliases: ['読書の技法', '静かな'],
        publisher: null,
        coverUrl: null,
        coverProvider: 'none',
        readingStatus: 'unread',
      });
    }
  });
});

describe('googleBooksUrl', () => {
  it('Google Books 由来の本だけ書籍ページの URL を返す', () => {
    expect(googleBooksUrl('google:abc_D-12')).toBe('https://books.google.com/books?id=abc_D-12');
    expect(googleBooksUrl(null)).toBeNull();
    expect(googleBooksUrl('openlibrary:OL1M')).toBeNull();
    expect(googleBooksUrl('google:a/../b')).toBeNull();
  });
});
