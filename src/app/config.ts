/** アプリ名（ユーザー指定の正式名。AURA はデザイン上の仮称なので使わない）。 */
export const APP_NAME = 'Jotbound';
export const APP_DESCRIPTION = '読書中の気づきを声で記録し、確認してから保存する読書メモ';

/** 要件定義書 6章: 標準モデル。別モデルへの自動切替は行わない。 */
export const AI_MODEL = 'gemini-3.5-flash-lite';

/**
 * 録音の上限（要件 SCR-04）。音声は base64 で約1.33倍になるため、
 * 10MB でも AI Logic のリクエスト上限 20MB に収まる。
 */
export const RECORDING_LIMITS = {
  maxDurationMs: 120_000,
  maxBytes: 10 * 1024 * 1024,
  minDurationMs: 1_000,
} as const;

/** これより古い未保存の下書きは、起動時に整理を提案する（自動削除はしない） */
export const STALE_DRAFT_MS = 24 * 60 * 60 * 1000;
