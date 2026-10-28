import { ExtractionError, type ExtractionErrorKind } from './types';

type AIErrorLike = { code?: unknown; message?: unknown; customErrorData?: { status?: unknown } };

/**
 * Firebase AI Logic SDK の例外（AIError）を利用者向けの種類に分類する。
 * SDK は HTTP エラーを code 'fetch-error' と customErrorData.status で返す（公式: ai-logic/error-codes）。
 */
export function classifyAIError(e: unknown, online = typeof navigator === 'undefined' || navigator.onLine): ExtractionErrorKind {
  if (e instanceof ExtractionError) return e.kind;
  if (e instanceof DOMException && e.name === 'AbortError') return 'aborted';
  const err = (typeof e === 'object' && e !== null ? e : {}) as AIErrorLike;
  const code = typeof err.code === 'string' ? err.code : '';
  const message = typeof err.message === 'string' ? err.message : '';
  const status = typeof err.customErrorData?.status === 'number' ? err.customErrorData.status : undefined;

  if (code === 'api-not-enabled') return 'notConfigured';
  if (status === 429) return 'quota';
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 413) return 'tooLarge';
  if (status === 400 && /payload|too large|exceeds the (maximum|limit)|request size/i.test(message)) return 'tooLarge';
  if (status === 404) return 'notConfigured';
  if (code === 'parse-failed' || code === 'invalid-content') return 'invalidResponse';
  if (code === 'response-error') return 'blocked';
  if (!online) return 'offline';
  // fetch 自体の失敗（通信切断・タイムアウト）は code 'error' で包まれる
  if (code === 'error' && /Error fetching|Failed to fetch|NetworkError|Load failed|timed? ?out/i.test(message)) return 'offline';
  if (e instanceof TypeError) return 'offline';
  return 'failed';
}
