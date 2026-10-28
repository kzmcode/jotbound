import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createBook, shot, signIn } from './helpers';

test.describe('バックアップ', () => {
  test('JSON で書き出し → 別のアカウントで読み込み → 本・メモ・タグの関係が戻る。Markdown も書き出せる', async ({ page }, info) => {
    await signIn(page, '/');
    await createBook(page, '静かな読書の技法');
    await page.getByRole('link', { name: '手入力でメモ' }).click();
    await page.getByRole('textbox', { name: 'ページ', exact: true }).fill('70');
    await page.getByRole('textbox', { name: /^引用・記録した言葉/ }).fill('読みかけの本のほうが、考えを運んでくれる');
    await page.getByRole('textbox', { name: '自分のコメント' }).fill('次の授業の参考にしたい。');
    await page.getByRole('textbox', { name: 'テーマタグを追加' }).fill('教育');
    await page.getByRole('textbox', { name: 'テーマタグを追加' }).press('Enter');
    await page.getByRole('button', { name: '保存する' }).click();
    await expect(page.getByText('メモを保存しました')).toBeVisible({ timeout: 15_000 });

    // メモ単位の Markdown（引用に書名とページを併記）
    const mdDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Markdown で書き出す' }).click();
    const md = await readFile(await (await mdDownload).path(), 'utf8');
    expect(md).toContain('> — 『静かな読書の技法』p.70');
    expect(md).toContain('- テーマ: #教育');

    // JSON の書き出し
    await page.goto('/settings');
    await expect(page.getByText('本 1冊・メモ 1件・タグ 1件')).toBeVisible({ timeout: 15_000 });
    const jsonDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'JSON で書き出す' }).click();
    const download = await jsonDownload;
    expect(download.suggestedFilename()).toMatch(/^jotbound-backup-\d{8}-\d{4}\.json$/);
    const backupPath = info.outputPath('backup.json');
    await download.saveAs(backupPath);
    const backup = JSON.parse(await readFile(backupPath, 'utf8'));
    expect(backup.notes[0].bookId).toBe(backup.books[0].id);
    expect(backup.notes[0].topicTagIds).toEqual([backup.tags[0].id]);

    // 別のアカウント（空のデータ）で読み込む
    await page.getByRole('button', { name: 'ログアウト' }).click();
    await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible({ timeout: 15_000 });
    await signIn(page, '/settings', '別の 利用者');
    await expect(page.getByText('本 0冊・メモ 0件・タグ 0件')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('import-file').setInputFiles(backupPath);
    const preview = page.getByTestId('import-preview');
    await expect(preview).toBeVisible();
    await expect(page.getByTestId('import-row-notes').getByRole('cell').first()).toHaveText('1');
    await shot(page, info, 'import-preview');
    await preview.getByRole('button', { name: '読み込む' }).click();
    await expect(page.getByText('3件を読み込みました。')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('本 1冊・メモ 1件・タグ 1件')).toBeVisible();

    // もう一度読み込んでもスキップされ、重複しない
    await page.getByTestId('import-file').setInputFiles(backupPath);
    await expect(page.getByTestId('import-row-notes').getByRole('cell')).toHaveText(['0', '0', '1']);
    await expect(preview.getByRole('button', { name: '読み込む' })).toBeDisabled();
    await preview.getByRole('button', { name: 'キャンセル' }).click();

    // 関係が戻っている（メモ → 本・タグ）
    await page.goto(`/notes/${backup.notes[0].id}`);
    await expect(page.locator('blockquote')).toContainText('読みかけの本');
    await expect(page.getByRole('link', { name: '#教育' })).toBeVisible();
    await expect(page.getByRole('link', { name: /静かな読書の技法/ })).toBeVisible();

    // 書籍単位の Markdown
    await page.goto(`/books/${backup.books[0].id}`);
    const bookMd = page.waitForEvent('download');
    await page.getByRole('button', { name: 'メモを Markdown で書き出す' }).click();
    expect(await readFile(await (await bookMd).path(), 'utf8')).toContain('メモ 1件');
  });
});
