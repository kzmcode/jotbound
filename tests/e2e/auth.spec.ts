import { expect, test } from '@playwright/test';
import { signIn, signInWithPopupUi } from './helpers';

test.describe('認証', () => {
  test('未ログインではログイン画面のみ表示し、横スクロールしない', async ({ page }) => {
    await page.goto('/notes');
    await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'メインメニュー' })).toHaveCount(0);
    for (const width of [360, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
  });

  test('Google ログイン → プロフィール作成（Rules 適用）→ ログアウト', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const { email } = await signInWithPopupUi(page, '/', '鈴木 一真');
    // ヘッダーにログイン状態
    await expect(page.getByRole('link', { name: 'アカウント: 鈴木 一真（設定を開く）' })).toBeVisible();

    await page.getByRole('link', { name: /アカウント:/ }).click();
    await expect(page.getByText(email)).toBeVisible();
    const uid = (await page.getByTestId('uid').textContent())!.trim();
    expect(uid).toMatch(/^[A-Za-z0-9]+$/);

    // settings/profile が Firestore Emulator に作成されている（＝ Rules の検証を通過した）
    const res = await page.request.get(
      `http://127.0.0.1:8080/v1/projects/demo-jotbound/databases/(default)/documents/users/${uid}/settings/profile`,
      { headers: { Authorization: 'Bearer owner' } },
    );
    expect(res.status()).toBe(200);
    const fields = (await res.json()).fields;
    expect(fields.preferredModel.stringValue).toBe('gemini-3.5-flash-lite');

    await page.getByRole('button', { name: 'ログアウト' }).click();
    await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('再読み込み後もログイン状態が保持される', async ({ page }) => {
    await signIn(page);
    await page.reload();
    await expect(page.getByRole('button', { name: '音声メモを開始' })).toBeVisible();
  });
});
