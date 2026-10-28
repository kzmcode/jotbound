import { expect, test } from '@playwright/test';
import { shot, signIn } from './helpers';

const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-jotbound/databases/(default)/documents';

test.describe('本棚・書籍', () => {
  test('手入力で登録 → 本棚 → 詳細 → 編集 → 削除ガード → 削除', async ({ page }, info) => {
    await signIn(page, '/books');
    await expect(page.getByText('まだ本が登録されていません。')).toBeVisible();

    // Books API キーがない環境では検索の代わりに案内が出る
    await page.getByRole('link', { name: '書籍を登録' }).first().click();
    await expect(page.locator('input[name="bookMode"][value="isbn"]')).toHaveCount(0);
    await page.locator('label:has(input[name="bookMode"][value="title"])').click();
    await expect(page.getByText(/Google Books API キーの設定が必要です/)).toBeVisible();
    await page.locator('label:has(input[name="bookMode"][value="manual"])').click();

    await page.getByRole('textbox', { name: /^書名/ }).fill('静かな読書の技法');
    await page.getByRole('textbox', { name: '著者' }).fill('霧島透');
    await page.getByRole('textbox', { name: 'ISBN' }).fill('978-4-00-310101-9');
    await page.getByRole('button', { name: '登録する' }).click();
    await expect(page.getByText('ISBN の形式が正しくありません。')).toBeVisible();
    await shot(page, info, 'book-new');
    await page.getByRole('textbox', { name: 'ISBN' }).fill('4-00-310101-4');
    await page.getByRole('button', { name: '登録する' }).click();

    // 詳細（Firestore Emulator に Rules を通って保存された）
    await expect(page.getByRole('heading', { name: '静かな読書の技法' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('9784003101018')).toBeVisible();
    const bookId = page.url().split('/').pop()!;

    // 本棚に代替表紙で表示
    await page.getByRole('navigation', { name: 'メインメニュー' }).getByRole('link', { name: '本棚' }).click();
    const grid = page.getByRole('list', { name: '登録済みの本' });
    await expect(grid.getByRole('link')).toHaveCount(1);
    await shot(page, info, 'books-grid');
    await grid.getByRole('link').click();

    // 編集
    await page.getByRole('button', { name: '編集' }).click();
    await page.locator('label:has(input[name="readingStatus"][value="finished"])').click();
    await page.getByRole('button', { name: '変更を保存' }).click();
    // 編集フォームが閉じ、詳細の読書状態が更新される
    await expect(page.getByRole('button', { name: '編集' })).toBeVisible();
    const status = page.getByTestId('reading-status');
    await expect(status.getByRole('radio', { name: '読了' })).toBeChecked();
    // 編集に入らずに読書状態を変える
    await status.locator('label:has(input[value="reading"])').click();
    await expect(status.getByRole('radio', { name: '読書中' })).toBeChecked();
    await shot(page, info, 'book-detail-status');

    // 重複登録は確認を挟む
    await page.goto('/books/new');
    await page.locator('label:has(input[name="bookMode"][value="manual"])').click();
    await page.getByRole('textbox', { name: /^書名/ }).fill('静かな読書の技法');
    await page.getByRole('button', { name: '登録する' }).click();
    await expect(page.getByRole('dialog', { name: '同じ本が登録済みかもしれません' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'キャンセル' }).click();

    // メモがある本は削除できない（メモは Emulator に直接投入）
    const uid = await page.evaluate(async () => {
      const req = indexedDB.open('firebaseLocalStorageDb');
      return new Promise<string>((resolve) => {
        req.onsuccess = () => {
          const tx = req.result.transaction('firebaseLocalStorage', 'readonly');
          const all = tx.objectStore('firebaseLocalStorage').getAll();
          all.onsuccess = () => resolve(all.result.find((r: { value?: { uid?: string } }) => r.value?.uid)?.value.uid ?? '');
        };
      });
    });
    expect(uid).not.toBe('');
    const noteRes = await page.request.post(`${FIRESTORE}/users/${uid}/notes?documentId=n1`, {
      headers: { Authorization: 'Bearer owner' },
      data: { fields: { bookId: { stringValue: bookId }, quote: { stringValue: 'q' }, comment: { stringValue: '' } } },
    });
    expect(noteRes.ok()).toBe(true);

    await page.goto(`/books/${bookId}`);
    // 再読み込み後も変更が保持されている
    await expect(page.getByTestId('reading-status').getByRole('radio', { name: '読書中' })).toBeChecked();
    await page.getByRole('button', { name: '削除' }).click();
    await expect(page.getByRole('alert')).toContainText('この本には 1 件のメモがあります');
    await shot(page, info, 'book-detail-guard');

    // メモを消すと削除できる
    await page.request.delete(`${FIRESTORE}/users/${uid}/notes/n1`, { headers: { Authorization: 'Bearer owner' } });
    await page.getByRole('button', { name: '削除' }).click();
    const dialog = page.getByRole('dialog', { name: 'この本を削除しますか？' });
    await dialog.getByRole('button', { name: '削除する' }).click();
    await expect(page).toHaveURL(/\/books$/);
    await expect(page.getByText('まだ本が登録されていません。')).toBeVisible();
  });
});
