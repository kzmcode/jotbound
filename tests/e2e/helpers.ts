import { expect, type Page, type TestInfo } from '@playwright/test';

const newEmail = () => `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

/** 疑似 Google 資格情報で Auth Emulator にログインする（テストごとに新しいユーザー）。 */
export async function signIn(page: Page, path = '/', name = 'テスト 利用者') {
  const email = newEmail();
  await page.goto(path);
  await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
  await page.waitForFunction(() => '__jotboundEmulatorSignIn' in window);
  await page.evaluate(
    ([e, n]) => (window as unknown as { __jotboundEmulatorSignIn: (e: string, n: string) => Promise<void> }).__jotboundEmulatorSignIn(e!, n!),
    [email, name],
  );
  // ログイン後の所有者確認（Firestore）が終わるまで待つ
  await expect(page.getByRole('navigation', { name: 'メインメニュー' })).toBeVisible({ timeout: 15_000 });
  return { email };
}

/**
 * 実際のログイン画面と同じく、Auth Emulator のポップアップ UI を操作してログインする。
 * ポップアップは unpkg から UI スクリプトを読み込むため、ネットワーク接続が必要。
 */
export async function signInWithPopupUi(page: Page, path = '/', name = 'テスト 利用者') {
  await page.goto(path);
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Google でログイン' }).click();
  const popup = await popupPromise;
  // UI スクリプト（window.mdc）が読み込まれるまで操作を受け付けない
  await popup.waitForFunction(() => 'mdc' in window, undefined, { timeout: 15_000 });
  const addButton = popup.locator('#add-account-button');
  if (await addButton.isVisible()) await addButton.click();
  await expect(popup.locator('#email-input')).toBeVisible();
  const email = newEmail();
  await popup.locator('#email-input').fill(email);
  await popup.locator('#display-name-input').fill(name);
  await popup.locator('#sign-in').click();
  // 高負荷時に Emulator の画面がクリックを取りこぼすことがあるため、閉じなければ一度だけ押し直す
  await popup.waitForEvent('close', { timeout: 8_000 }).catch(async () => {
    if (!popup.isClosed()) await popup.locator('#sign-in').click();
  });
  // ログイン後の所有者確認（Firestore）が終わるまで待つ
  await expect(page.getByRole('navigation', { name: 'メインメニュー' })).toBeVisible({ timeout: 15_000 });
  return { email };
}

/** 目視確認用: ライト/ダーク両方の全体スクリーンショットを test-results/shots に保存する */
export async function shot(page: Page, info: TestInfo, name: string) {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.screenshot({ path: `test-results/shots/${info.project.name}-${name}-${scheme}.png`, fullPage: true });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

/** 手入力で本を1冊登録し、詳細画面に移るまで待つ */
export async function createBook(page: Page, title: string) {
  await page.goto('/books/new');
  await page.locator('label:has(input[name="bookMode"][value="manual"])').click();
  await page.getByRole('textbox', { name: /^書名/ }).fill(title);
  await page.getByRole('button', { name: '登録する' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 15_000 });
}
