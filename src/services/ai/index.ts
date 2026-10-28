import type { MemoExtractionProvider } from './types';

let provider: Promise<MemoExtractionProvider> | null = null;

/** AI 実装を遅延読み込みする（Firebase AI SDK は録音の確認画面で初めて読み込む） */
export function loadExtractionProvider(): Promise<MemoExtractionProvider> {
  provider ??=
    import.meta.env.VITE_USE_EMULATORS === 'true'
      ? import('./mockProvider').then((m) => new m.MockExtractionProvider())
      : import('./firebaseGemini').then((m) => new m.FirebaseGeminiProvider());
  provider.catch(() => {
    provider = null;
  });
  return provider;
}
