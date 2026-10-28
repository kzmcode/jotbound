import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeBook, makeNote, makeTag, renderAt } from './helpers';
import { mockDb, mockRepo } from './mockRepos';

const backupFile = (body: object) => new File([JSON.stringify({ format: 'jotbound-backup', version: 1, ...body })], 'backup.json', { type: 'application/json' });

function seed() {
  mockDb.books = [makeBook()];
  mockDb.tags = [makeTag()];
  mockDb.notes = [makeNote({ topicTagIds: ['t1'] })];
}

describe('設定: データのバックアップ', () => {
  it('JSON と Markdown を書き出せる', async () => {
    seed();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderAt('/settings');
    expect(await screen.findByText('本 1冊・メモ 1件・タグ 1件')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'JSON で書き出す' }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/jotbound-backup-\d{8}-\d{4}\.json」を保存しました/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Markdown で書き出す' }));
    expect(click).toHaveBeenCalledTimes(2);
    click.mockRestore();
  });

  it('読み込む前にプレビューを出し、確認してから書き込む', async () => {
    seed();
    renderAt('/settings');
    await screen.findByText('本 1冊・メモ 1件・タグ 1件');
    await userEvent.upload(
      screen.getByTestId('import-file'),
      backupFile({
        books: [{ id: 'b1', title: '静かな読書の技法' }, { id: 'b2', title: '新しい本' }],
        tags: [{ id: 'other', name: '教育', category: 'topic' }],
        notes: [
          { id: 'n1', bookId: 'b1', quote: '既存' },
          { id: 'n2', bookId: 'b2', comment: '新しいメモ', topicTagIds: ['other'] },
          { id: 'n3', bookId: 'missing', comment: '本がない' },
        ],
      }),
    );
    const preview = await screen.findByTestId('import-preview');
    expect(within(screen.getByTestId('import-row-books')).getAllByRole('cell').map((c) => c.textContent)).toEqual(['1', '0', '1']);
    expect(within(screen.getByTestId('import-row-notes')).getAllByRole('cell').map((c) => c.textContent)).toEqual(['1', '0', '1']);
    expect(within(preview).getByText(/同じ名前のタグが既にある 1件/)).toBeInTheDocument();
    expect(within(preview).getByText(/取り込めない項目が 1件/)).toBeInTheDocument();
    expect(mockRepo.applyImport).not.toHaveBeenCalled();

    await userEvent.click(within(preview).getByRole('button', { name: '読み込む' }));
    expect(await screen.findByText('2件を読み込みました。')).toBeInTheDocument();
    const plan = mockRepo.applyImport.mock.calls[0]![1] as { notes: { id: string; data: { topicTagIds: string[] } }[] };
    expect(plan.notes.map((n) => n.id)).toEqual(['n2']);
    expect(plan.notes[0]!.data.topicTagIds).toEqual(['t1']);
  });

  it('更新を選ぶと上書きの確認を出す', async () => {
    seed();
    mockRepo.applyImport.mockImplementationOnce(async (_uid: unknown, _plan: unknown, onProgress: unknown) => {
      (onProgress as (d: number, t: number) => void)(1, 1);
    });
    renderAt('/settings');
    await screen.findByText('本 1冊・メモ 1件・タグ 1件');
    await userEvent.upload(screen.getByTestId('import-file'), backupFile({ books: [{ id: 'b1', title: '改題' }] }));
    const preview = await screen.findByTestId('import-preview');
    expect(within(preview).getByRole('button', { name: '読み込む' })).toBeDisabled();
    await userEvent.click(within(preview).getByRole('radio', { name: '更新' }));
    await userEvent.click(within(preview).getByRole('button', { name: '読み込む' }));
    const dialog = await screen.findByRole('dialog', { name: '既存のデータを上書きしますか？' });
    expect(mockRepo.applyImport).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: '上書きして読み込む' }));
    await waitFor(() => expect(mockRepo.applyImport).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('1件を読み込みました。')).toBeInTheDocument();
  });

  it('形式が違うファイルや途中の失敗を説明する', async () => {
    seed();
    renderAt('/settings');
    await screen.findByText('本 1冊・メモ 1件・タグ 1件');
    await userEvent.upload(screen.getByTestId('import-file'), new File(['not json'], 'x.json', { type: 'application/json' }));
    expect(await screen.findByText(/JSON として読み取れませんでした/)).toBeInTheDocument();

    mockRepo.applyImport.mockRejectedValueOnce(new Error('offline'));
    await userEvent.upload(screen.getByTestId('import-file'), backupFile({ books: [{ id: 'b5', title: '本' }] }));
    await userEvent.click(within(await screen.findByTestId('import-preview')).getByRole('button', { name: '読み込む' }));
    expect(await screen.findByText(/途中で失敗しました/)).toBeInTheDocument();
  });

  it('メモ詳細・書籍詳細から Markdown を書き出せる', async () => {
    seed();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderAt('/notes/n1');
    await userEvent.click(await screen.findByRole('button', { name: 'Markdown で書き出す' }));
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });
});
