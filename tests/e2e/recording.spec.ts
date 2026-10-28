import { expect, test, type Page } from '@playwright/test';
import { sampleResponse as sample } from '../unit/aiSample';
import { createBook, shot, signIn } from './helpers';

type MockAI = { response?: string; error?: string; delayMs?: number; calls?: number };
/** AI 抽出のモック（E2E ビルドのみ。src/services/ai/mockProvider.ts） */
const mockAI = (page: Page, config: MockAI, consent = false) =>
  page.addInitScript(
    ([c, agreed]) => {
      if (agreed) localStorage.setItem('rn.aiConsent', '1');
      (window as unknown as { __jotboundMockAI: unknown }).__jotboundMockAI = c;
    },
    [config, consent] as const,
  );
const aiCalls = (page: Page) => page.evaluate(() => (window as unknown as { __jotboundMockAI: MockAI }).__jotboundMockAI.calls ?? 0);

test.describe('録音（偽のマイク）と AI 抽出（モック）', () => {
  test('書籍登録 → 録音 → AI 抽出 → 確認 → 保存 → 検索', async ({ page }, info) => {
    await mockAI(page, { response: JSON.stringify(sample), delayMs: 1200 });
    await signIn(page);
    await createBook(page, '静かな読書の技法');
    await page.goto('/');

    await page.getByRole('button', { name: '音声メモを開始' }).click();
    await expect(page).toHaveURL(/\/record$/);
    await expect(page.getByRole('status').filter({ hasText: '録音中' })).toBeVisible();
    await expect(page.locator('.orb')).toHaveAttribute('data-live', 'true');
    await expect(page.getByText('00:02')).toBeVisible({ timeout: 5_000 });
    await shot(page, info, 'recording');

    // 一時停止中はタイマーが止まる
    await page.getByRole('button', { name: '一時停止' }).click();
    await expect(page.getByRole('status').filter({ hasText: '一時停止中' })).toBeVisible();
    await expect(page.locator('.orb')).toHaveAttribute('data-live', 'false');
    const pausedAt = await page.locator('p.tabular-nums').textContent();
    await page.waitForTimeout(1200);
    await expect(page.locator('p.tabular-nums')).toHaveText(pausedAt!);
    await page.getByRole('button', { name: '再開する' }).click();

    // 丸ボタンの再タップで停止（要件 SCR-01）
    await page.getByRole('button', { name: '録音を停止して内容を確認' }).click();
    await expect(page).toHaveURL(/\/review\/.+/);
    // 初回は送信についての説明。同意するまで送信しない
    await expect(page.getByRole('heading', { name: '音声を AI で解析します' })).toBeVisible();
    expect(await aiCalls(page)).toBe(0);
    // 端末内に保存された録音を再生できる
    const duration = await page.locator('audio').evaluate(
      (el: HTMLAudioElement) =>
        new Promise<number>((resolve) => {
          if (el.readyState >= 1) resolve(el.duration);
          else el.addEventListener('loadedmetadata', () => resolve(el.duration), { once: true });
        }),
    );
    expect(duration).toBeGreaterThan(0);
    await shot(page, info, 'review-consent');
    await page.getByRole('button', { name: '同意して解析する' }).click();

    // 解析中（架空の進捗率は出さず段階のみ）
    await expect(page.getByRole('heading', { name: '音声を解析しています…' })).toBeVisible();
    await shot(page, info, 'processing');

    // 抽出結果が確認フォームに入る（保存はまだ）
    const book = page.getByRole('combobox', { name: /^書籍/ });
    await expect(book.locator('option:checked')).toHaveText(/静かな読書の技法/, { timeout: 10_000 });
    await expect(page.getByRole('textbox', { name: 'ページ', exact: true })).toHaveValue('70');
    await expect(page.getByRole('textbox', { name: /引用・記録した言葉/ })).toHaveValue(sample.quote);
    await expect(page.getByRole('button', { name: '教育 を追加' })).toBeVisible();
    await page.getByText('元の文字起こし').click();
    await expect(page.getByText(sample.transcript)).toBeVisible();
    await shot(page, info, 'review-extracted');

    await page.getByRole('button', { name: '教育 を追加' }).click();
    await page.getByRole('button', { name: '内容を確認して保存' }).click();
    await expect(page.getByText('メモを保存しました')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/^音声メモ ·/)).toBeVisible();
    await expect(page.getByText('#教育')).toBeVisible();
    expect(await aiCalls(page)).toBe(1);

    // 検索で見つかる
    await page.goto('/notes');
    await page.getByRole('searchbox', { name: 'メモを検索' }).fill('遠くまで運んで');
    await expect(page.getByText(/読みかけの本/).first()).toBeVisible();

    // 下書きは削除され、確認待ちは表示されない
    await page.goto('/');
    await expect(page.getByText(/確認待ち/)).toHaveCount(0);
  });

  test('AI の 429 は説明を出して自動で再試行しない。再試行後、未登録の本は登録して確認画面へ戻る', async ({ page }, info) => {
    await mockAI(page, { error: 'quota', delayMs: 200 }, true);
    await signIn(page);
    await page.getByRole('button', { name: '音声メモを開始' }).click();
    await expect(page.getByText('00:01')).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: '停止して内容を確認', exact: true }).click();
    await expect(page.getByText(/本日の無料利用枠/)).toBeVisible();
    await shot(page, info, 'analysis-failed');
    await page.waitForTimeout(1000);
    expect(await aiCalls(page)).toBe(1);

    await page.evaluate((response) => {
      Object.assign((window as unknown as { __jotboundMockAI: object }).__jotboundMockAI, { error: undefined, response });
    }, JSON.stringify({ ...sample, bookMention: '未登録の本' }));
    await page.getByRole('button', { name: '再試行する' }).click();
    // 本棚にない本は自動で選ばず、登録へ案内する
    await expect(page.getByText(/「未登録の本」は本棚に見つかりませんでした/)).toBeVisible();
    expect(await aiCalls(page)).toBe(2);
    await page.getByRole('button', { name: 'この本を登録する' }).click();
    await expect(page).toHaveURL(/\/books\/new$/);
    const title = page.getByRole('textbox', { name: /^書名/ });
    if (!(await title.isVisible())) await page.locator('label:has(input[name="bookMode"][value="manual"])').click();
    await title.fill('未登録の本');
    await page.getByRole('button', { name: '登録する' }).click();
    // 登録後は確認画面に戻り、入力途中の内容と新しい本が入っている（再解析しない）
    await expect(page).toHaveURL(/\/review\/.+/);
    await expect(page.getByRole('combobox', { name: /^書籍/ }).locator('option:checked')).toHaveText('未登録の本', { timeout: 10_000 });
    await expect(page.getByRole('textbox', { name: /引用・記録した言葉/ })).toHaveValue(sample.quote);
    expect(await aiCalls(page)).toBe(2);
  });

  test('「あとで確認する」で確認待ちに残り、ホームから再開・破棄できる', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: '音声メモを開始' }).click();
    await expect(page.getByText('00:01')).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: '停止して内容を確認', exact: true }).click();
    await page.getByRole('button', { name: '解析せずに手入力する' }).click();
    await page.getByRole('button', { name: 'あとで確認する' }).click();

    await expect(page.getByRole('link', { name: /確認待ちの録音 · 1件/ })).toBeVisible();
    // 再読み込みしても端末内に残っている
    await page.reload();
    await page.getByRole('link', { name: /確認待ちの録音 · 1件/ }).click();
    await page.getByRole('button', { name: '破棄' }).click();
    await page.getByRole('dialog', { name: 'この録音を破棄しますか？' }).getByRole('button', { name: '破棄する' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(/確認待ちの録音/)).toHaveCount(0);
  });

  test('マイクを拒否された場合は設定方法と手入力を案内し、録音中にならない', async ({ page }, info) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
    });
    await signIn(page);
    await page.getByRole('button', { name: '音声メモを開始' }).click();
    await expect(page.getByText('マイクへのアクセスが許可されていません')).toBeVisible();
    await expect(page.getByRole('link', { name: '手入力でメモ' })).toBeVisible();
    await expect(page.locator('.orb')).toHaveCount(0);
    await shot(page, info, 'record-denied');
  });

  test('録音中のキャンセルは確認してから破棄し、マイクを解放する', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: '音声メモを開始' }).click();
    await expect(page.getByText('00:02')).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: 'キャンセル' }).click();
    await page.getByRole('dialog', { name: '録音を破棄しますか？' }).getByRole('button', { name: '破棄する' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(/確認待ちの録音/)).toHaveCount(0);
  });
});
