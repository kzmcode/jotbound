import type { TagCategory, UsageStatus } from '../../types/models';

/**
 * AI 連携のインターフェース（要件 8章）。UI はこの型だけに依存し、
 * MVP の FirebaseGeminiProvider を将来ローカル推論などの別実装に差し替えられるようにする。
 * Zod は応答の検証時（extraction.ts）にだけ読み込み、初期バンドルに含めない。
 */

/** 補助文脈の上限（要件 FR-AI: 大量の本一覧を毎回送信しない） */
export const CONTEXT_LIMITS = { books: 20, tagsPerCategory: 30 } as const;

/** アプリ側の検証で見つかった問題（AI の warnings とは別に表示する） */
export type ExtractionIssue = 'pageInvalid' | 'pageRange' | 'truncated';

/** 検証・整形済みの抽出結果 */
export type ExtractedMemo = {
  transcript: string;
  bookMention: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  quote: string;
  comment: string;
  topicTagCandidates: string[];
  usageTagCandidates: string[];
  usageStatus: UsageStatus;
  warnings: string[];
  multipleMemoDetected: boolean;
  issues: ExtractionIssue[];
};

export type ExtractionInput = {
  audio: Blob;
  mimeType: string;
  /** 補助文脈（件数を制限して渡す。本棚全体を毎回送らない） */
  candidateBooks: Array<{ id: string; title: string }>;
  existingTags: Array<{ id: string; name: string; category: TagCategory }>;
  signal?: AbortSignal;
};

export interface MemoExtractionProvider {
  extract(input: ExtractionInput): Promise<ExtractedMemo>;
  /** 接続診断（短いテキストのリクエストを1回送る） */
  checkConnection(): Promise<void>;
}

/**
 * 利用者に区別して説明するエラー（要件 FR-AI / 10章）。
 * - quota: 429（無料枠・レート上限）
 * - forbidden: 403（App Check・API キー・権限）
 * - unauthenticated: 401（認証済みユーザー限定モードでの拒否）
 * - tooLarge: 413 またはサイズ超過
 * - offline: 通信切断・タイムアウト
 * - notConfigured: AI Logic が未設定（404 など）
 * - blocked: 安全性フィルターなどで応答が得られない
 * - invalidResponse: JSON が不正・項目が欠落
 */
export type ExtractionErrorKind =
  | 'quota'
  | 'forbidden'
  | 'unauthenticated'
  | 'tooLarge'
  | 'offline'
  | 'notConfigured'
  | 'blocked'
  | 'invalidResponse'
  | 'aborted'
  | 'failed';

export class ExtractionError extends Error {
  readonly kind: ExtractionErrorKind;
  constructor(kind: ExtractionErrorKind, message?: string) {
    super(message ?? kind);
    this.name = 'ExtractionError';
    this.kind = kind;
  }
}
