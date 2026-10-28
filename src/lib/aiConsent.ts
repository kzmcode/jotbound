/**
 * AI 解析（音声の外部送信）についての説明を確認したか（端末ごと。要件 6章: 初回利用時にプライバシー説明を表示）。
 * localStorage が使えない環境では毎回説明を表示する。
 */
const KEY = 'rn.aiConsent';

export function hasAiConsent(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setAiConsent(value: boolean): void {
  try {
    if (value) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    // 保存できなくても解析は続けられる（次回また説明を表示する）
  }
}
