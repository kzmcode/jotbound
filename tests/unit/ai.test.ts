import { describe, expect, it } from 'vitest';
import { classifyAIError } from '../../src/services/ai/errors';
import { base64Size, buildPrompt, parseExtraction } from '../../src/services/ai/extraction';
import { CONTEXT_LIMITS, ExtractionError } from '../../src/services/ai/types';
import { sampleResponse } from './aiSample';

const json = (over: Record<string, unknown> = {}) => JSON.stringify({ ...sampleResponse, ...over });

describe('AI 応答の検証（Zod）', () => {
  it('要件の例をそのまま受け付け、引用は発話のまま残す', () => {
    const m = parseExtraction(json());
    expect(m.bookMention).toBe('静かな読書の技法');
    expect(m.pageStart).toBe(70);
    expect(m.quote).toBe(sampleResponse.quote);
    expect(m.usageStatus).toBe('planned');
    expect(m.issues).toEqual([]);
  });

  it('JSON でない・項目の欠落・型の違いは invalidResponse', () => {
    const kind = (text: string) => {
      try {
        parseExtraction(text);
        return null;
      } catch (e) {
        return e instanceof ExtractionError ? e.kind : 'other';
      }
    };
    expect(kind('すみません')).toBe('invalidResponse');
    const { quote: _q, ...missing } = sampleResponse;
    expect(kind(JSON.stringify(missing))).toBe('invalidResponse');
    expect(kind(json({ pageStart: '70' }))).toBe('invalidResponse');
    expect(kind(json({ usageStatus: 'done' }))).toBe('invalidResponse');
  });

  it('コードブロックで囲まれた応答も読む', () => {
    expect(parseExtraction('```json\n' + json() + '\n```').pageStart).toBe(70);
  });

  it('不正なページは空欄にして知らせる。終了ページだけなら開始ページに移す', () => {
    expect(parseExtraction(json({ pageStart: 0 }))).toMatchObject({ pageStart: null, issues: ['pageInvalid'] });
    expect(parseExtraction(json({ pageStart: 70.5 }))).toMatchObject({ pageStart: null, issues: ['pageInvalid'] });
    expect(parseExtraction(json({ pageStart: 80, pageEnd: 70 }))).toMatchObject({ pageStart: 80, pageEnd: null, issues: ['pageRange'] });
    expect(parseExtraction(json({ pageStart: null, pageEnd: 12 }))).toMatchObject({ pageStart: 12, pageEnd: null });
    expect(parseExtraction(json({ pageStart: 70, pageEnd: 72 }))).toMatchObject({ pageStart: 70, pageEnd: 72, issues: [] });
  });

  it('null は空欄に、タグ候補は重複・# を除いて整える', () => {
    const m = parseExtraction(json({ quote: null, comment: '  ', bookMention: '', topicTagCandidates: ['#教育', '教育', ' ', '哲学'] }));
    expect(m).toMatchObject({ quote: '', comment: '', bookMention: null, topicTagCandidates: ['教育', '哲学'] });
  });

  it('上限を超える文字数は切り詰めて知らせる', () => {
    const m = parseExtraction(json({ quote: 'あ'.repeat(6000) }));
    expect(m.quote).toHaveLength(5000);
    expect(m.issues).toContain('truncated');
  });
});

describe('プロンプトと補助文脈', () => {
  it('本とタグの件数を制限して渡す', () => {
    const candidateBooks = Array.from({ length: 50 }, (_, i) => ({ id: `b${i}`, title: `本${i}` }));
    const existingTags = Array.from({ length: 50 }, (_, i) => ({ id: `t${i}`, name: `タグ${i}`, category: 'topic' as const }));
    const prompt = buildPrompt({ candidateBooks, existingTags });
    expect(prompt).toContain(`本${CONTEXT_LIMITS.books - 1}`);
    expect(prompt).not.toContain(`本${CONTEXT_LIMITS.books}\n`);
    expect(prompt).not.toContain(`タグ${CONTEXT_LIMITS.tagsPerCategory}、`);
    expect(prompt).toContain('発話のまま');
  });

  it('base64 化後のサイズを見積もる', () => {
    expect(base64Size(3)).toBe(4);
    expect(base64Size(10 * 1024 * 1024)).toBeLessThan(20 * 1024 * 1024);
  });
});

describe('AI エラーの分類', () => {
  const fetchError = (status: number, message = '') => ({ code: 'fetch-error', message, customErrorData: { status } });
  it.each([
    [fetchError(429), 'quota'],
    [fetchError(403), 'forbidden'],
    [fetchError(401), 'unauthenticated'],
    [fetchError(413), 'tooLarge'],
    [fetchError(400, 'Request payload size exceeds the limit'), 'tooLarge'],
    [fetchError(404), 'notConfigured'],
    [{ code: 'api-not-enabled' }, 'notConfigured'],
    [{ code: 'response-error' }, 'blocked'],
    [{ code: 'error', message: 'Error fetching from https://x: Failed to fetch' }, 'offline'],
    [new DOMException('x', 'AbortError'), 'aborted'],
    [new ExtractionError('invalidResponse'), 'invalidResponse'],
    [fetchError(500), 'failed'],
  ])('%o → %s', (e, kind) => {
    expect(classifyAIError(e, true)).toBe(kind);
  });

  it('オフラインなら通信エラーとして扱う', () => {
    expect(classifyAIError(new Error('x'), false)).toBe('offline');
  });
});
