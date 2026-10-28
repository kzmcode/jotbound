import { z } from 'zod';
import { LIMITS } from '../../types/models';
import { CONTEXT_LIMITS, ExtractionError, type ExtractedMemo, type ExtractionInput, type ExtractionIssue } from './types';

/** モデルが返す JSON の形（要件 FR-AI の出力項目）。型が合わなければ invalidResponse として扱う */
export const rawExtractionSchema = z.object({
  transcript: z.string(),
  bookMention: z.string().nullable(),
  pageStart: z.number().nullable(),
  pageEnd: z.number().nullable(),
  quote: z.string().nullable(),
  comment: z.string().nullable(),
  topicTagCandidates: z.array(z.string()),
  usageTagCandidates: z.array(z.string()),
  usageStatus: z.enum(['unassigned', 'planned', 'used']),
  warnings: z.array(z.string()),
  multipleMemoDetected: z.boolean(),
});

export type RawExtraction = z.infer<typeof rawExtractionSchema>;
const TAG_CANDIDATES_MAX = 5;

/** Firebase AI Logic のリクエスト上限は 20MB。base64 化で約 1.33 倍になるため送信前に確認する */
export const REQUEST_MAX_BYTES = 20 * 1024 * 1024;
export const base64Size = (bytes: number) => Math.ceil(bytes / 3) * 4;

export function buildPrompt(input: Pick<ExtractionInput, 'candidateBooks' | 'existingTags'>): string {
  const books = input.candidateBooks.slice(0, CONTEXT_LIMITS.books).map((b) => `- ${b.title}`);
  const tagsOf = (category: 'topic' | 'usage') =>
    input.existingTags
      .filter((t) => t.category === category)
      .slice(0, CONTEXT_LIMITS.tagsPerCategory)
      .map((t) => t.name)
      .join('、');
  return [
    'あなたは読書メモの記録を手伝います。添付の音声は、利用者が本を読みながら話した1件のメモです。',
    '音声を文字起こしし、次の規則で項目を抽出して、指定された JSON だけを返してください。',
    '',
    '規則:',
    '- transcript: 発話をそのまま文字起こしする。言い直しも含め、内容を要約・補完しない。',
    '- bookMention: 発話に出てきた書名。下の「登録済みの本」と明らかに同じ本ならその表記を使う。書名の発話がなければ null。',
    '- pageStart / pageEnd: 発話されたページ番号（1以上の整数）。範囲なら両方、1ページなら pageEnd は null。発話がなければ両方 null。',
    '- quote: 本の文章として読み上げた部分を、発話のまま抜き出す。漢字や助詞を「正しい日本語」や原文に推測で直さない。なければ null。',
    '- comment: 利用者自身の感想・考え・予定。発話にない内容を創作しない。なければ null。',
    '- topicTagCandidates: 話題・概念のタグ候補を0〜3個。既存のテーマタグに合うものがあれば、その名前をそのまま使う。',
    '- usageTagCandidates: 用途（授業・研究・執筆など）のタグ候補を0〜2個。既存の活用先タグを優先する。',
    '- usageStatus: これから使う予定を話していれば "planned"、すでに使ったと話していれば "used"、どちらでもなければ "unassigned"。',
    '- warnings: 聞き取りにくい箇所、書名やページが曖昧な点など、利用者が確認すべきことを日本語で短く。なければ空の配列。',
    '- multipleMemoDetected: 別々の本や話題の複数のメモが1つの録音に含まれていれば true。その場合も1件分だけ抽出する。',
    '- 不明な項目は推測せず null にする。',
    '',
    '登録済みの本（参考。この中にない本の場合もあります）:',
    books.length > 0 ? books.join('\n') : '- （なし）',
    '',
    `既存のテーマタグ: ${tagsOf('topic') || '（なし）'}`,
    `既存の活用先タグ: ${tagsOf('usage') || '（なし）'}`,
  ].join('\n');
}

const clean = (s: string | null | undefined) => (s ?? '').trim();

function cleanTags(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim().replace(/^[#＃]/, '').slice(0, LIMITS.tagNameMax);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out.slice(0, TAG_CANDIDATES_MAX);
}

const validPage = (n: number | null) => n === null || (Number.isInteger(n) && n >= 1 && n <= LIMITS.pageMax);

/**
 * モデルの応答テキストを JSON として解析し、Zod で再検証して整形する（要件 FR-AI）。
 * 構造が不正なら invalidResponse。ページの値など項目単位の問題は空欄にして issues で知らせる。
 */
export function parseExtraction(text: string): ExtractedMemo {
  let json: unknown;
  try {
    // 念のためコードブロックで囲まれた応答も受け付ける
    json = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new ExtractionError('invalidResponse', 'response is not JSON');
  }
  const parsed = rawExtractionSchema.safeParse(json);
  if (!parsed.success) throw new ExtractionError('invalidResponse', parsed.error.message);
  const r = parsed.data;

  const issues: ExtractionIssue[] = [];
  let pageStart = r.pageStart;
  let pageEnd = r.pageEnd;
  if (!validPage(pageStart) || !validPage(pageEnd)) {
    issues.push('pageInvalid');
    if (!validPage(pageStart)) pageStart = null;
    if (!validPage(pageEnd)) pageEnd = null;
  }
  if (pageStart === null && pageEnd !== null) {
    pageStart = pageEnd;
    pageEnd = null;
  }
  if (pageStart !== null && pageEnd !== null && pageEnd < pageStart) {
    issues.push('pageRange');
    pageEnd = null;
  }
  if (pageEnd === pageStart) pageEnd = null;

  const limit = (s: string, max: number) => {
    if (s.length <= max) return s;
    if (!issues.includes('truncated')) issues.push('truncated');
    return s.slice(0, max);
  };

  return {
    transcript: limit(clean(r.transcript), LIMITS.transcriptMax),
    bookMention: clean(r.bookMention).slice(0, LIMITS.titleMax) || null,
    pageStart,
    pageEnd,
    quote: limit(clean(r.quote), LIMITS.quoteMax),
    comment: limit(clean(r.comment), LIMITS.commentMax),
    topicTagCandidates: cleanTags(r.topicTagCandidates),
    usageTagCandidates: cleanTags(r.usageTagCandidates),
    usageStatus: r.usageStatus,
    warnings: r.warnings.map((w) => w.trim()).filter(Boolean).slice(0, 10),
    multipleMemoDetected: r.multipleMemoDetected,
    issues,
  };
}

/** Blob を base64（data URL の本体）に変換する */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}
