import { getAI, getGenerativeModel, GoogleAIBackend, Schema, type GenerativeModel } from 'firebase/ai';
import { AI_MODEL } from '../../app/config';
import { getFirebase } from '../firebase/app';
import { classifyAIError } from './errors';
import { base64Size, blobToBase64, buildPrompt, parseExtraction, REQUEST_MAX_BYTES } from './extraction';
import { ExtractionError, type ExtractedMemo, type ExtractionInput, type MemoExtractionProvider } from './types';

const REQUEST_TIMEOUT_MS = 90_000;

/** 応答の JSON Schema（Firebase AI Logic の Schema クラス。値の範囲などはアプリ側の Zod で再検証する） */
const responseSchema = Schema.object({
  properties: {
    transcript: Schema.string({ description: '発話の文字起こし（そのまま）' }),
    bookMention: Schema.string({ nullable: true, description: '発話に出た書名' }),
    pageStart: Schema.integer({ nullable: true, description: '開始ページ（1以上）' }),
    pageEnd: Schema.integer({ nullable: true, description: '終了ページ（範囲のときのみ）' }),
    quote: Schema.string({ nullable: true, description: '本の文章として読み上げた部分（発話のまま）' }),
    comment: Schema.string({ nullable: true, description: '利用者自身のコメント' }),
    topicTagCandidates: Schema.array({ items: Schema.string(), maxItems: 3 }),
    usageTagCandidates: Schema.array({ items: Schema.string(), maxItems: 2 }),
    usageStatus: Schema.enumString({ enum: ['unassigned', 'planned', 'used'] }),
    warnings: Schema.array({ items: Schema.string() }),
    multipleMemoDetected: Schema.boolean(),
  },
});

/**
 * MVP の AI 実装。Firebase AI Logic（Gemini Developer API）で gemini-3.5-flash-lite に
 * 音声とプロンプトを1回送り、文字起こしと項目抽出を JSON で受け取る（要件 FR-AI）。
 * App Check トークンと Firebase Auth の ID トークンは SDK がリクエストに付与する。
 * 失敗しても自動で再試行しない（再試行は利用者が選ぶ）。
 */
export class FirebaseGeminiProvider implements MemoExtractionProvider {
  private model: GenerativeModel | null = null;

  private getModel(): GenerativeModel {
    if (this.model) return this.model;
    const services = getFirebase();
    if (!services) throw new ExtractionError('notConfigured', 'firebase not configured');
    const ai = getAI(services.app, { backend: new GoogleAIBackend() });
    this.model = getGenerativeModel(
      ai,
      {
        model: AI_MODEL,
        generationConfig: { responseMimeType: 'application/json', responseSchema, temperature: 0 },
      },
      { timeout: REQUEST_TIMEOUT_MS },
    );
    return this.model;
  }

  async extract(input: ExtractionInput): Promise<ExtractedMemo> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) throw new ExtractionError('offline');
    const prompt = buildPrompt(input);
    if (base64Size(input.audio.size) + prompt.length * 3 >= REQUEST_MAX_BYTES) throw new ExtractionError('tooLarge');
    try {
      const model = this.getModel();
      const data = await blobToBase64(input.audio);
      const result = await model.generateContent(
        [prompt, { type: 'inlineData', inlineData: { mimeType: baseMime(input.mimeType), data } }],
        { signal: input.signal },
      );
      return parseExtraction(result.response.text());
    } catch (e) {
      if (e instanceof ExtractionError) throw e;
      throw new ExtractionError(classifyAIError(e), e instanceof Error ? e.message : String(e));
    }
  }

  async checkConnection(): Promise<void> {
    try {
      const model = this.getModel();
      // 構造化出力の設定を使うため JSON で応答させる（入出力とも数トークン）
      const result = await model.generateContent(
        'Return the JSON with transcript "ok", all nullable fields null, empty arrays, usageStatus "unassigned", multipleMemoDetected false.',
      );
      parseExtraction(result.response.text());
    } catch (e) {
      if (e instanceof ExtractionError) throw e;
      throw new ExtractionError(classifyAIError(e), e instanceof Error ? e.message : String(e));
    }
  }
}

/** "audio/webm;codecs=opus" → "audio/webm"（AI Logic の対応形式の表記に合わせる） */
const baseMime = (mime: string) => mime.split(';')[0]!.trim();
