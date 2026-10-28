import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeBook, makeNote, makeTag, renderAt } from './helpers';
import { mockDb, mockRepo } from './mockRepos';

const textbox = (name: RegExp | string) => screen.getByRole('textbox', { name });

describe('手入力でメモを作成', () => {
  it('本がなければ登録へ誘導し、保存できない', async () => {
    renderAt('/notes/new');
    expect(await screen.findByText('本が登録されていません。先に本を登録してください。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存する' })).toBeDisabled();
  });

  it('検証エラーを項目ごとに表示し、正しく入力すると固定IDで1回だけ保存する', async () => {
    mockDb.books = [makeBook()];
    mockDb.tags = [makeTag({ id: 't1', name: '教育', normalizedName: '教育' })];
    let release: () => void = () => {};
    mockRepo.saveNewNote.mockImplementationOnce(() => new Promise((r) => (release = () => r('created'))));
    const router = renderAt('/notes/new?bookId=b1');

    await userEvent.click(await screen.findByRole('button', { name: '保存する' }));
    expect(screen.getByText('引用かコメントのどちらかを入力してください。')).toBeInTheDocument();
    expect(screen.getByText('確認が必要な項目があります。内容を修正してください。')).toBeInTheDocument();

    await userEvent.type(textbox('ページ'), '72');
    await userEvent.type(textbox('終了ページ'), '70');
    await userEvent.type(textbox(/^引用・記録した言葉/), '読みかけの本');
    await userEvent.click(screen.getByRole('button', { name: '保存する' }));
    expect(screen.getByText('終了ページは開始ページ以上にしてください。')).toBeInTheDocument();
    await userEvent.clear(textbox('終了ページ'));

    // 既存タグと同じ名前は既存タグを使う、新しい名前は新規タグ
    const topicInput = screen.getByRole('textbox', { name: 'テーマタグを追加' });
    await userEvent.type(topicInput, '教育');
    expect(screen.getByText('既存の「教育」を使う')).toBeInTheDocument();
    await userEvent.type(topicInput, '{Enter}');
    await userEvent.type(screen.getByRole('textbox', { name: '活用先タグを追加' }), '授業{Enter}');
    expect(screen.getByRole('button', { name: '授業 を外す' })).toHaveTextContent('新規');
    await userEvent.click(screen.getByText('活用予定'));

    const save = screen.getByRole('button', { name: '保存する' });
    await userEvent.click(save);
    // 保存中は二重送信できない
    expect(screen.getByRole('button', { name: '保存しています…' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '保存しています…' }));
    expect(mockRepo.saveNewNote).toHaveBeenCalledTimes(1);

    const [uid, noteId, input, newTags] = mockRepo.saveNewNote.mock.calls[0]!;
    expect(uid).toBe('uid123');
    expect(noteId).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(input).toMatchObject({ bookId: 'b1', pageStart: 72, pageEnd: null, quote: '読みかけの本', comment: '', topicTagIds: ['t1'], usageStatus: 'planned', inputMethod: 'manual' });
    expect(newTags).toEqual([expect.objectContaining({ name: '授業', category: 'usage' })]);

    release();
    await waitFor(() => expect(router.state.location.pathname).toBe(`/notes/${noteId}`));
  });
});

describe('メモ一覧', () => {
  it('0件と検索0件を区別する', async () => {
    renderAt('/notes');
    expect(await screen.findByText('まだメモはありません。')).toBeInTheDocument();
  });

  it('検索・絞り込みができ、検索0件の文言を出す', async () => {
    mockDb.books = [makeBook({ id: 'b1' }), makeBook({ id: 'b2', title: 'アイデアの余白', titleNormalized: 'あいであの余白' })];
    mockDb.tags = [makeTag({ id: 'u1', name: '授業', normalizedName: '授業', category: 'usage' })];
    mockDb.notes = [
      makeNote({ id: 'n1', bookId: 'b1', usageTagIds: ['u1'] }),
      makeNote({ id: 'n2', bookId: 'b2', quote: '', comment: '思いつきを書き留める', usageStatus: 'used' }),
    ];
    renderAt('/notes');
    const list = await screen.findByRole('list', { name: 'メモ一覧' });
    expect(within(list).getAllByRole('link')).toHaveLength(2);

    await userEvent.type(screen.getByRole('searchbox', { name: 'メモを検索' }), '授業');
    expect(within(screen.getByRole('list', { name: 'メモ一覧' })).getAllByRole('link')).toHaveLength(1);
    await userEvent.clear(screen.getByRole('searchbox', { name: 'メモを検索' }));

    await userEvent.click(screen.getByText('絞り込み・並べ替え'));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '活用状態' }), 'used');
    expect(within(screen.getByRole('list', { name: 'メモ一覧' })).getByRole('link')).toHaveTextContent('思いつきを書き留める');

    await userEvent.type(screen.getByRole('searchbox', { name: 'メモを検索' }), '存在しない語');
    expect(screen.getByText('一致するメモはありません。')).toBeInTheDocument();
  });

  it('ホームに最近のメモ、書籍詳細にその本のメモを表示する', async () => {
    mockDb.books = [makeBook()];
    mockDb.notes = [makeNote({ id: 'n1', pageStart: 70 }), makeNote({ id: 'n2', pageStart: 12, quote: '序章の言葉' })];
    renderAt('/books/b1');
    const list = await screen.findByRole('list', { name: 'この本のメモ' });
    // 既定はページ順
    expect(within(list).getAllByRole('link')[0]).toHaveTextContent('序章の言葉');
  });
});

describe('メモ詳細', () => {
  it('引用とコメントを区別して表示し、編集・削除できる', async () => {
    mockDb.books = [makeBook()];
    mockDb.tags = [makeTag({ id: 't1' })];
    mockDb.notes = [makeNote({ id: 'n1', topicTagIds: ['t1'] })];
    const router = renderAt('/notes/n1');
    expect((await screen.findByText(/読みかけの本/)).closest('blockquote')).not.toBeNull();
    expect(screen.getByRole('link', { name: '#教育' })).toHaveAttribute('href', '/notes?topicTagId=t1');

    await userEvent.click(screen.getByRole('button', { name: '編集' }));
    await userEvent.clear(textbox('自分のコメント'));
    await userEvent.type(textbox('自分のコメント'), '研究で使う');
    await userEvent.click(screen.getByRole('button', { name: '変更を保存' }));
    await waitFor(() =>
      expect(mockRepo.updateNote).toHaveBeenCalledWith('uid123', 'n1', expect.objectContaining({ comment: '研究で使う', topicTagIds: ['t1'] }), []),
    );

    await userEvent.click(await screen.findByRole('button', { name: '削除' }));
    await userEvent.click(await screen.findByRole('button', { name: '削除する' }));
    await waitFor(() => expect(mockRepo.deleteNote).toHaveBeenCalledWith('uid123', 'n1'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/notes'));
  });
});

describe('タグ管理（設定）', () => {
  it('改名・統合・削除できる', async () => {
    mockDb.tags = [makeTag({ id: 't1', name: '教育', normalizedName: '教育' }), makeTag({ id: 't2', name: '読書の技法', normalizedName: '読書の技法' })];
    mockDb.notes = [makeNote({ id: 'n1', topicTagIds: ['t1'] })];
    renderAt('/settings');
    const tagsSection = await screen.findByRole('region', { name: 'タグ' }).catch(() => document.body);
    const row = (name: string) => within(tagsSection).getByText(`#${name}`).closest('li')!;

    await userEvent.click(within(row('教育')).getByRole('button', { name: '名前を変更' }));
    const rename = screen.getByRole('textbox', { name: '「教育」の新しい名前' });
    await userEvent.clear(rename);
    await userEvent.type(rename, '読書の技法');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByText('同じ名前のタグがあります。統合を使ってください。')).toBeInTheDocument();
    expect(mockRepo.renameTag).not.toHaveBeenCalled();
    await userEvent.clear(rename);
    await userEvent.type(rename, '教育論');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(mockRepo.renameTag).toHaveBeenCalledWith('uid123', 't1', '教育論', '教育論'));

    await userEvent.click(within(row('教育')).getByRole('button', { name: '統合' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '「教育」の統合先' }), 't2');
    await userEvent.click(within(row('教育')).getAllByRole('button', { name: '統合' }).at(-1)!);
    expect(await screen.findByText(/「教育」を「読書の技法」に統合します。1件のメモ/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '統合する' }));
    await waitFor(() => expect(mockRepo.mergeTag).toHaveBeenCalledWith('uid123', 'topic', 't1', 't2'));

    await userEvent.click(within(row('読書の技法')).getByRole('button', { name: '削除' }));
    expect(await screen.findByText(/「読書の技法」を削除し、0件のメモから/)).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog', { name: 'タグを削除しますか？' })).getByRole('button', { name: '削除' }));
    await waitFor(() => expect(mockRepo.deleteTag).toHaveBeenCalledWith('uid123', 'topic', 't2'));
  });
});
