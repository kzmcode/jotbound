import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

const routes = ['/', '/books', '/books/new', '/notes', '/settings', '/record', '/review/x'];

test.describe('アプリシェル', () => {
  for (const path of routes) {
    test(`${path} はコンソールエラーなく描画される`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await signIn(page);
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test('360〜430px とタブレット/デスクトップで横スクロールがない', async ({ page }) => {
    await signIn(page);
    for (const width of [360, 375, 390, 430, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      for (const path of [...routes, '/?logged-out']) {
        await page.goto(path);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${path} @${width}px`).toBeLessThanOrEqual(0);
      }
    }
  });

  test('録音ボタンは中央に配置され 92px のタップ領域を持つ', async ({ page }) => {
    await signIn(page);
    const button = page.getByRole('button', { name: '音声メモを開始' });
    const box = (await button.boundingBox())!;
    const vw = page.viewportSize()!.width;
    expect(box.width).toBeGreaterThanOrEqual(92);
    expect(Math.abs(box.x + box.width / 2 - vw / 2)).toBeLessThan(2);
    // アイドル時はハローを脈動させない
    await expect(page.locator('.orb')).toHaveAttribute('data-live', 'false');
  });

  test('OS のダークモードに追従し、明示選択を優先・保持する', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await signIn(page, '/settings');
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const themeColor = async () => (await page.locator('meta[name="theme-color"]').getAttribute('content'))?.toUpperCase();
    expect(await bg()).toBe('rgb(21, 23, 40)'); // #151728 Midnight Iris
    expect(await themeColor()).toBe('#151728');

    await page.getByText('ライト', { exact: true }).click();
    expect(await bg()).toBe('rgb(239, 240, 250)'); // #EFF0FA Lavender Mist
    expect(await themeColor()).toBe('#EFF0FA');

    await page.reload();
    expect(await bg()).toBe('rgb(239, 240, 250)');

    await page.getByText('システム', { exact: true }).click();
    expect(await bg()).toBe('rgb(21, 23, 40)');
    await page.emulateMedia({ colorScheme: 'light' });
    expect(await bg()).toBe('rgb(239, 240, 250)');
  });

  test('キーボードだけで録音ボタンに到達でき、フォーカスが見える', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium');
    await signIn(page);
    const target = page.getByRole('button', { name: '音声メモを開始' });
    for (let i = 0; i < 6 && !(await target.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await expect(target).toBeFocused();
    const outline = await target.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).toBe('solid');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/record$/);
  });

  test('テーマはキーボード（矢印キー）で切り替えられる', async ({ page }) => {
    await signIn(page, '/settings');
    await page.getByRole('radio', { name: /ライト/ }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: /ダーク/ })).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('PWA マニフェストとアイコンが配信される', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifest = await (await request.get(href!)).json();
    expect(manifest.name).toBe('Jotbound');
    expect(manifest.display).toBe('standalone');
    await expect(page).toHaveTitle('Jotbound');
    for (const icon of manifest.icons) {
      expect((await request.get(icon.src)).status()).toBe(200);
    }
    expect((await request.get('/icons/apple-touch-icon.png')).status()).toBe(200);
  });

  test('目視確認用スクリーンショット（ライト/ダーク）', async ({ page }, info) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
      await page.screenshot({ path: `test-results/shots/${info.project.name}-login-${scheme}.png` });
    }
    await signIn(page, '/', '鈴木 一真');
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      for (const [name, path] of [['home', '/'], ['settings', '/settings'], ['books', '/books'], ['record', '/record']]) {
        await page.goto(path);
        await expect(page.locator('main h1, main [lang="en"]').first()).toBeVisible({ timeout: 15_000 });
        await page.screenshot({ path: `test-results/shots/${info.project.name}-${name}-${scheme}.png` });
      }
    }
  });
});
