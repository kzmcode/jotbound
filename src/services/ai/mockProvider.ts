import { parseExtraction } from './extraction';
import { ExtractionError, type ExtractionErrorKind, type ExtractedMemo, type ExtractionInput, type MemoExtractionProvider } from './types';

/**
 * E2E 専用（VITE_USE_EMULATORS=true のビルドのみ）。Emulator には AI Logic がないため、
 * テストが window.__jotboundMockAI に置いた応答を返す。本番ビルドには含まれない。
 */
export type MockAIConfig = {
  /** モデルの応答テキスト（JSON 文字列）。error が優先 */
  response?: string;
  error?: ExtractionErrorKind;
  delayMs?: number;
  /** 呼び出し回数（テストから参照する） */
  calls?: number;
  lastPrompt?: string;
};

const config = (): MockAIConfig => {
  const w = window as unknown as { __jotboundMockAI?: MockAIConfig };
  w.__jotboundMockAI ??= {};
  return w.__jotboundMockAI;
};

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });

export class MockExtractionProvider implements MemoExtractionProvider {
  async extract(input: ExtractionInput): Promise<ExtractedMemo> {
    const c = config();
    c.calls = (c.calls ?? 0) + 1;
    c.lastPrompt = input.candidateBooks.map((b) => b.title).join('\n');
    try {
      await wait(c.delayMs ?? 300, input.signal);
    } catch {
      throw new ExtractionError('aborted');
    }
    if (c.error) throw new ExtractionError(c.error);
    if (c.response === undefined) throw new ExtractionError('notConfigured');
    return parseExtraction(c.response);
  }

  async checkConnection(): Promise<void> {
    const c = config();
    if (c.error) throw new ExtractionError(c.error);
  }
}
