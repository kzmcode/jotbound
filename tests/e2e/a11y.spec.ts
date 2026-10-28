import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { sampleResponse as sample } from '../unit/aiSample';
import { createBook, signIn } from './helpers';

/**
 * 主要画面の自動アクセシビリティ検査（axe-core、WCAG 2.2 A/AA）。
 * ライト・ダークの両方でコントラストを含めて確認する。目視の確認は ACCEPTANCE_CHECKLIST に沿って別途行う。
 */
async function audit(page: Page, label: string) {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    // テーマ切り替え直後は色のトランジション（160ms）の途中なので、終わるのを待つ
    await page.waitForTimeout(400);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    const summary = result.violations.map(
      (v) =>
        `${v.id} (${v.impact}): ${v.nodes
          .slice(0, 3)
          .map((n) => `${n.target.join(' ')} — ${(n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 160)}`)
          .join(' | ')}`,
    );
    expect(summary, `${label} [${scheme}]`).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

test.describe('アクセシビリティ（axe）', () => {
  test('ログイン画面', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
    await audit(page, 'login');
  });

  test('主要画面（データあり・なし）と確認画面', async ({ page }) => {
    await page.addInitScript((response) => {
      localStorage.setItem('rn.aiConsent', '1');
      (window as unknown as { __jotboundMockAI: unknown }).__jotboundMockAI = { response };
    }, JSON.stringify(sample));
    await signIn(page);

    // データなし
    await audit(page, 'home-empty');
    await page.goto('/notes');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await audit(page, 'notes-empty');

    // データあり
    await createBook(page, '静かな読書の技法');
    const bookUrl = page.url();
    await page.getByRole('link', { name: '手入力でメモ' }).click();
    await page.getByRole('textbox', { name: 'ページ', exact: true }).fill('70');
    await page.getByRole('textbox', { name: /^引用・記録した言葉/ }).fill('読みかけの本のほうが、考えを運んでくれる');
    await page.getByRole('textbox', { name: 'テーマタグを追加' }).fill('教育');
    await page.getByRole('textbox', { name: 'テーマタグを追加' }).press('Enter');
    await audit(page, 'note-form');
    await page.getByRole('button', { name: '保存する' }).click();
    await expect(page.getByText('メモを保存しました')).toBeVisible({ timeout: 15_000 });
    await audit(page, 'note-detail');

    for (const [path, label] of [
      ['/', 'home'],
      ['/books', 'books'],
      [new URL(bookUrl).pathname, 'book-detail'],
      ['/books/new', 'book-new'],
      ['/notes', 'notes'],
      ['/settings', 'settings'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await audit(page, label);
    }

    // 録音中 → 確認画面（AI 抽出結果）
    await page.goto('/');
    await page.getByRole('button', { name: '音声メモを開始' }).click();
    await expect(page.getByRole('status').filter({ hasText: '録音中' })).toBeVisible();
    await expect(page.getByText('00:01')).toBeVisible({ timeout: 5_000 });
    await audit(page, 'recording');
    await page.getByRole('button', { name: '録音を停止して内容を確認' }).click();
    await expect(page.getByRole('textbox', { name: /^引用・記録した言葉/ })).toHaveValue(sample.quote, { timeout: 15_000 });
    await audit(page, 'review-extracted');
  });

  test('拡大表示（幅 320px 相当・WCAG のリフロー）でも横スクロールが出ず、主要操作が見える', async ({ page }) => {
    await signIn(page);
    await createBook(page, 'とても長い書名の本 — 静かな読書の技法をめぐる長い副題つきの一冊（増補改訂版）');
    const bookPath = new URL(page.url()).pathname;
    await page.getByRole('link', { name: '手入力でメモ' }).click();
    await page.getByRole('textbox', { name: /^引用・記録した言葉/ }).fill('長い引用'.repeat(40));
    await page.getByRole('textbox', { name: 'テーマタグを追加' }).fill('とても長いタグの名前をつけたテーマ');
    await page.getByRole('textbox', { name: 'テーマタグを追加' }).press('Enter');
    await page.getByRole('button', { name: '保存する' }).click();
    await expect(page.getByText('メモを保存しました')).toBeVisible({ timeout: 15_000 });
    const notePath = new URL(page.url()).pathname;

    await page.setViewportSize({ width: 320, height: 640 });
    for (const path of ['/', '/books', bookPath, '/books/new', '/notes', notePath, '/notes/new', '/settings']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} @320px`).toBeLessThanOrEqual(0);
    }
    await page.goto('/');
    await expect(page.getByRole('button', { name: '音声メモを開始' })).toBeInViewport();
    await expect(page.getByRole('navigation', { name: 'メインメニュー' })).toBeVisible();
  });
});
