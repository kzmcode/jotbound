import { expect, test } from '@playwright/test';
import { shot, signIn } from './helpers';

test.describe('手動メモ・タグ・検索', () => {
  test('本を登録 → メモを手入力（新規タグ）→ 一覧・検索 → 編集 → タグ改名 → 削除', async ({ page }, info) => {
    await signIn(page, '/books/new');
    await page.locator('label:has(input[name="bookMode"][value="manual"])').click();
    await page.getByRole('textbox', { name: /^書名/ }).fill('静かな読書の技法');
    await page.getByRole('textbox', { name: '著者' }).fill('霧島透');
    await page.getByRole('button', { name: '登録する' }).click();
    await expect(page.getByRole('heading', { name: '静かな読書の技法' })).toBeVisible({ timeout: 15_000 });

    // 書籍詳細から手入力メモへ（本が選択された状態）
    await page.getByRole('link', { name: '手入力でメモ' }).click();
    await expect(page.getByRole('combobox', { name: /^書籍/ })).toHaveValue(/.+/);
    await page.getByRole('textbox', { name: 'ページ', exact: true }).fill('70');
    await page.getByRole('textbox', { name: /^引用・記録した言葉/ }).fill('読みかけの本のほうが、考えを遠くまで運んでくれる');
    await page.getByRole('textbox', { name: '自分のコメント' }).fill('次の授業の参考にしたい。');
    await page.getByRole('textbox', { name: 'テーマタグを追加' }).fill('教育');
    await page.getByRole('textbox', { name: 'テーマタグを追加' }).press('Enter');
    await page.getByRole('textbox', { name: '活用先タグを追加' }).fill('授業');
    await page.getByRole('textbox', { name: '活用先タグを追加' }).press('Enter');
    await page.locator('label:has(input[name="usageStatus"][value="planned"])').click();
    await shot(page, info, 'note-form');
    await page.getByRole('button', { name: '保存する' }).click();

    // 詳細（Rules を通って保存された）
    await expect(page.getByText('メモを保存しました')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('blockquote')).toContainText('読みかけの本');
    await expect(page.getByRole('link', { name: '#教育' })).toBeVisible();
    await expect(page.getByRole('link', { name: '#授業' })).toBeVisible();
    await shot(page, info, 'note-detail');

    // 一覧と検索（書名・タグ名でもヒット）
    await page.getByRole('navigation', { name: 'メインメニュー' }).getByRole('link', { name: 'メモ' }).click();
    const list = page.getByRole('list', { name: 'メモ一覧' });
    await expect(list.getByRole('link')).toHaveCount(1);
    await shot(page, info, 'notes-list');
    await page.getByRole('searchbox', { name: 'メモを検索' }).fill('霧島 授業');
    await expect(list.getByRole('link')).toHaveCount(1);
    await page.getByRole('searchbox', { name: 'メモを検索' }).fill('存在しない');
    await expect(page.getByText('一致するメモはありません。')).toBeVisible();
    await page.getByRole('searchbox', { name: 'メモを検索' }).fill('');

    // ホームの最近のメモ
    await page.getByRole('navigation', { name: 'メインメニュー' }).getByRole('link', { name: 'ホーム' }).click();
    await expect(page.getByRole('list', { name: '最近のメモ' }).getByRole('link')).toHaveCount(1);
    await shot(page, info, 'home-recent');

    // 編集
    await page.getByRole('list', { name: '最近のメモ' }).getByRole('link').click();
    await page.getByRole('button', { name: '編集' }).click();
    await page.getByRole('textbox', { name: '自分のコメント' }).fill('研究にも使う。');
    await page.getByRole('button', { name: '変更を保存' }).click();
    await expect(page.getByText('研究にも使う。')).toBeVisible();
    const noteUrl = page.url();

    // タグ改名（メモは ID 参照なので表示が追従する）
    await page.goto('/settings');
    const row = page.locator('li', { hasText: '#教育' });
    await row.getByRole('button', { name: '名前を変更' }).click();
    await page.getByRole('textbox', { name: '「教育」の新しい名前' }).fill('教育哲学');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText('#教育哲学')).toBeVisible();
    await shot(page, info, 'settings-tags');
    await page.goto(noteUrl);
    await expect(page.getByRole('link', { name: '#教育哲学' })).toBeVisible();

    // 削除
    await page.getByRole('button', { name: '削除' }).click();
    await page.getByRole('dialog', { name: 'このメモを削除しますか？' }).getByRole('button', { name: '削除する' }).click();
    await expect(page).toHaveURL(/\/notes$/);
    await expect(page.getByText('まだメモはありません。')).toBeVisible();
  });
});
