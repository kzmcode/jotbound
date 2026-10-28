/**
 * 録音形式を端末で判定する（要件 SCR-04）。iOS Safari は audio/mp4、Chrome/Firefox は audio/webm。
 * いずれも Firebase AI Logic（Gemini）が受け付ける形式。
 */
const CANDIDATES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/aac', 'audio/ogg;codecs=opus'];

export function pickMimeType(isTypeSupported: (type: string) => boolean): string | null {
  return CANDIDATES.find((t) => isTypeSupported(t)) ?? null;
}

/** AI へ送るときはパラメータ（codecs=...）を外した基本形にする */
export function baseMimeType(mimeType: string): string {
  return mimeType.split(';')[0]!.trim();
}

export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** 波形表示用: 時間領域のサンプル（0〜255、中心128）から音量（0〜1）を求める */
export function levelFromSamples(samples: Uint8Array): number {
  let sum = 0;
  for (const v of samples) {
    const x = (v - 128) / 128;
    sum += x * x;
  }
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return Math.min(1, rms * 3);
}

export type MicError = 'denied' | 'noDevice' | 'unsupported' | 'failed';

/** getUserMedia の失敗を利用者向けの種別に分類する */
export function classifyMicError(e: unknown): MicError {
  const name = e instanceof DOMException || e instanceof Error ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'noDevice';
  if (name === 'NotSupportedError' || name === 'TypeError') return 'unsupported';
  return 'failed';
}
