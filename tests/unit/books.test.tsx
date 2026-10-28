import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeBook, renderAt } from './helpers';
import { mockDb, mockRepo } from './mockRepos';

/** 環境変数（.env.local に依存しない値）を指定して、モジュールを読み直して描画する */
async function renderWithEnv(path: string, env: Record<string, string>) {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  vi.resetModules();
  const helpers = await import('./helpers');
  return helpers.renderAt(path);
}

afterEach(() => vi.unstubAllEnvs());


describe('本棚', () => {
  it('0冊なら空状態と登録ボタン', async () => {
    renderAt('/books');
    expect(await screen.findByText('まだ本が登録されていません。')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /書籍を登録/ }).length).toBeGreaterThan(0);
  });

  it('書名・著者・読書状態で絞り込める（書影なしは代替表紙）', async () => {
    mockDb.books = [
      makeBook({ id: 'b1', title: '静かな読書の技法', titleNormalized: '静かな読書の技法', authors: ['霧島透'], readingStatus: 'reading' }),
      makeBook({ id: 'b2', title: 'アイデアの余白', titleNormalized: 'あいであの余白', authors: ['山田'], readingStatus: 'finished' }),
    ];
    renderAt('/books');
    const list = await screen.findByRole('list', { name: '登録済みの本' });
    expect(within(list).getAllByRole('link')).toHaveLength(2);

    await userEvent.type(screen.getByRole('searchbox'), 'アイデア');
    expect(within(screen.getByRole('list', { name: '登録済みの本' })).getAllByRole('link').map((l) => l.textContent)).toEqual([
      expect.stringContaining('アイデアの余白'),
    ]);
    await userEvent.clear(screen.getByRole('searchbox'));
    await userEvent.type(screen.getByRole('searchbox'), '霧島');
    expect(within(screen.getByRole('list', { name: '登録済みの本' })).getAllByRole('link')).toHaveLength(1);

    await userEvent.clear(screen.getByRole('searchbox'));
    await userEvent.click(screen.getByRole('radio', { name: '読了' }));
    expect(within(screen.getByRole('list', { name: '登録済みの本' })).getByRole('link')).toHaveTextContent('アイデアの余白');
    await userEvent.click(screen.getByRole('radio', { name: '未読' }));
    expect(screen.getByText('条件に一致する本はありません。')).toBeInTheDocument();
  });
});

describe('書籍登録', () => {
  it('手入力で登録し、詳細へ遷移する', async () => {
    const router = renderAt('/books/new');
    await userEvent.click(screen.getByRole('radio', { name: '手入力' }));
    await userEvent.click(screen.getByRole('button', { name: '登録する' }));
    expect(screen.getByText('書名を入力してください。')).toBeInTheDocument();
    expect(mockRepo.createBook).not.toHaveBeenCalled();

    await userEvent.type(screen.getByRole('textbox', { name: /^書名/ }), '新しい本');
    await userEvent.type(screen.getByLabelText('著者'), '著者A、著者B');
    await userEvent.type(screen.getByRole('textbox', { name: 'ISBN' }), '4-00-310101-4');
    await userEvent.click(screen.getByRole('button', { name: '登録する' }));
    await waitFor(() => expect(mockRepo.createBook).toHaveBeenCalledTimes(1));
    expect(mockRepo.createBook).toHaveBeenCalledWith(
      'uid123',
      expect.objectContaining({ title: '新しい本', authors: ['著者A', '著者B'], isbn13: '9784003101018', coverProvider: 'none' }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/books/new1'));
  });

  it('重複の疑いがあれば確認し、同名異版として登録もできる', async () => {
    mockDb.books = [makeBook({ id: 'b1', title: '新しい本', titleNormalized: '新しい本', isbn13: null })];
    renderAt('/books/new');
    await userEvent.click(screen.getByRole('radio', { name: '手入力' }));
    await userEvent.type(screen.getByRole('textbox', { name: /^書名/ }), '新しい本');
    await userEvent.click(screen.getByRole('button', { name: '登録する' }));
    expect(await screen.findByText('同じ本が登録済みかもしれません')).toBeInTheDocument();
    expect(mockRepo.createBook).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '別の本として登録' }));
    await waitFor(() => expect(mockRepo.createBook).toHaveBeenCalledTimes(1));
  });

  it('Books API キー未設定なら検索の代わりに案内し、手入力へ誘導する', async () => {
    await renderWithEnv('/books/new', { VITE_GOOGLE_BOOKS_API_KEY: '' });
    await userEvent.click(screen.getByRole('radio', { name: '書名' }));
    expect(screen.getByText(/Google Books API キーの設定が必要です/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '手入力で登録する' }));
    expect(screen.getByRole('textbox', { name: /^書名/ })).toBeInTheDocument();
  });
});

describe('書籍詳細', () => {
  it('情報と「この本で録音」を表示する', async () => {
    mockDb.books = [makeBook({ aliases: ['読書の技法'] })];
    renderAt('/books/b1');
    expect(await screen.findByRole('heading', { name: '静かな読書の技法' })).toBeInTheDocument();
    expect(screen.getByText('読書中')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'この本で録音' })).toHaveAttribute('href', '/record?bookId=b1');
  });

  it('メモがある本は削除を止め、移動・削除を案内する', async () => {
    mockDb.books = [makeBook()];
    mockRepo.countNotesForBook.mockResolvedValue(3);
    renderAt('/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: '削除' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('この本には 3 件のメモがあります');
    expect(mockRepo.deleteBook).not.toHaveBeenCalled();
  });

  it('メモがなければ確認のうえ削除して本棚へ戻る', async () => {
    mockDb.books = [makeBook()];
    const router = renderAt('/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: '削除' }));
    await userEvent.click(await screen.findByRole('button', { name: '削除する' }));
    await waitFor(() => expect(mockRepo.deleteBook).toHaveBeenCalledWith('uid123', 'b1'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/books'));
  });

  it('編集に入らずに読書状態を変えられる', async () => {
    mockDb.books = [makeBook()];
    renderAt('/books/b1');
    const status = await screen.findByRole('group', { name: '読書状態' });
    expect(within(status).getByRole('radio', { name: '読書中' })).toBeChecked();
    await userEvent.click(within(status).getByRole('radio', { name: '読了' }));
    await waitFor(() =>
      expect(mockRepo.updateBook).toHaveBeenCalledWith('uid123', 'b1', expect.objectContaining({ readingStatus: 'finished', title: '静かな読書の技法' })),
    );
    const input = mockRepo.updateBook.mock.calls[0]![2] as Record<string, unknown>;
    expect(Object.keys(input)).not.toContain('id');
    expect(Object.keys(input)).not.toContain('createdAt');
  });

  it('編集して保存できる', async () => {
    mockDb.books = [makeBook()];
    renderAt('/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: '編集' }));
    await userEvent.click(screen.getByRole('radio', { name: '読了' }));
    await userEvent.click(screen.getByRole('button', { name: '変更を保存' }));
    await waitFor(() =>
      expect(mockRepo.updateBook).toHaveBeenCalledWith('uid123', 'b1', expect.objectContaining({ readingStatus: 'finished' })),
    );
  });
});

describe('書名検索', () => {
  it('ISBN のタブはなく、書名検索が最初に選ばれている。見つからなければ手入力へ案内する', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    await renderWithEnv('/books/new', { VITE_GOOGLE_BOOKS_API_KEY: 'K' });
    expect(await screen.findByRole('radio', { name: '書名' })).toBeChecked();
    expect(screen.queryByRole('radio', { name: 'ISBN' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: '書名' }), '存在しない本');
    await userEvent.click(screen.getByRole('button', { name: '検索' }));
    expect(await screen.findByText(/書籍情報が見つかりません/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '手入力で登録する' }));
    expect(screen.getByRole('textbox', { name: /^書名/ })).toHaveValue('');
    vi.unstubAllGlobals();
  });
});
