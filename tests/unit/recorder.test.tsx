import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyMicError, formatDuration, levelFromSamples, pickMimeType } from '../../src/features/recorder/recordingUtils';
import { deleteDraft, getDraft, listDrafts, saveDraft } from '../../src/storage/drafts';
import { makeBook, renderAt } from './helpers';
import { mockDb, mockRepo } from './mockRepos';

describe('録音ユーティリティ', () => {
  it('端末が対応する形式を選ぶ（iOS は mp4、Chrome は webm）。なければ null', () => {
    expect(pickMimeType((t) => t === 'audio/mp4')).toBe('audio/mp4');
    expect(pickMimeType((t) => t.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
    expect(pickMimeType(() => false)).toBeNull();
  });

  it('マイクのエラーを分類する', () => {
    expect(classifyMicError(new DOMException('x', 'NotAllowedError'))).toBe('denied');
    expect(classifyMicError(new DOMException('x', 'NotFoundError'))).toBe('noDevice');
    expect(classifyMicError(new DOMException('x', 'AbortError'))).toBe('failed');
  });

  it('音量と時間の表示', () => {
    expect(levelFromSamples(new Uint8Array(64).fill(128))).toBe(0);
    expect(levelFromSamples(new Uint8Array(64).fill(255))).toBe(1);
    expect(formatDuration(65_400)).toBe('01:05');
  });
});

describe('下書きストア（IndexedDB）', () => {
  it('保存・一覧（新しい順、音声は含めない）・取得・削除', async () => {
    const base = { uid: 'uid123', noteId: 'n', audio: new Blob(['a']), mimeType: 'audio/webm', durationMs: 3000, size: 1, bookId: null, stopReason: 'user' as const };
    await saveDraft({ ...base, id: 'd1', createdAt: 1, updatedAt: 1 });
    await saveDraft({ ...base, id: 'd2', createdAt: 2, updatedAt: 2 });
    const list = await listDrafts('uid123');
    expect(list.map((d) => d.id)).toEqual(['d2', 'd1']);
    expect('audio' in list[0]!).toBe(false);
    expect((await getDraft('d1', 'uid123'))?.mimeType).toBe('audio/webm');
    await deleteDraft('d1');
    await deleteDraft('d2');
    expect(await listDrafts('uid123')).toEqual([]);
  });
});

// ---- 録音画面（偽のマイク・MediaRecorder） ----

let now = 0;
const track = { stop: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
const stream = { getTracks: () => [track], getAudioTracks: () => [track] };

class FakeMediaRecorder {
  static isTypeSupported = (t: string) => t.startsWith('audio/webm');
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_s: unknown, opts: { mimeType: string }) {
    this.mimeType = opts.mimeType;
  }
  start() {
    this.state = 'recording';
  }
  pause() {
    this.state = 'paused';
  }
  resume() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio-bytes'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

function installMedia(getUserMedia: () => Promise<unknown> = async () => stream) {
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(getUserMedia) } });
}

beforeEach(async () => {
  now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  track.stop.mockClear();
  for (const d of await listDrafts('uid123')) await deleteDraft(d.id);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('録音画面', () => {
  it('MediaRecorder がない端末では録音を開始せず、手入力へ誘導する', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: '音声メモを開始' }));
    expect(await screen.findByText('この端末・ブラウザでは録音できません')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '手入力でメモ' })).toHaveAttribute('href', '/notes/new');
    expect(screen.queryByText('録音中')).not.toBeInTheDocument();
  });

  it('マイクを拒否されたら、設定方法と再試行・手入力を案内する', async () => {
    installMedia(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: '音声メモを開始' }));
    expect(await screen.findByText('マイクへのアクセスが許可されていません')).toBeInTheDocument();
    expect(screen.getByText(/iPhone: 設定/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
    expect(screen.queryByText('録音中')).not.toBeInTheDocument();
  });

  it('録音 → 下書き保存 → 確認画面で入力して保存 → 下書き削除（固定IDで1件）', async () => {
    installMedia();
    mockDb.books = [makeBook()];
    mockDb.profile = { preferredModel: 'gemini-3.5-flash-lite', preferredBookId: 'b1', schemaVersion: 1, updatedAt: null as never };
    const router = renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: '音声メモを開始' }));
    expect(await screen.findByText('録音中')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/record');

    now = 5_000;
    await userEvent.click(screen.getByRole('button', { name: '停止して内容を確認' }));
    // マイクを解放する
    expect(track.stop).toHaveBeenCalled();
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/review\/.+/));

    const drafts = await listDrafts('uid123');
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ durationMs: 5000, bookId: 'b1', mimeType: 'audio/webm;codecs=opus', stopReason: 'user' });

    // 確認画面: 保存前に Firestore へは書き込まない
    expect(await screen.findByRole('heading', { name: '内容を確認' })).toBeInTheDocument();
    expect(mockRepo.saveNewNote).not.toHaveBeenCalled();
    // 初回は送信の説明が出る。ここでは AI 解析を使わずに手入力で続ける
    await userEvent.click(await screen.findByRole('button', { name: '解析せずに手入力する' }));
    expect(await screen.findByRole('combobox', { name: /^書籍/ })).toHaveValue('b1');
    await userEvent.type(screen.getByRole('textbox', { name: '自分のコメント' }), '声で記録した気づき');
    await userEvent.click(screen.getByRole('button', { name: '内容を確認して保存' }));

    await waitFor(() => expect(mockRepo.saveNewNote).toHaveBeenCalledTimes(1));
    const [, noteId, input] = mockRepo.saveNewNote.mock.calls[0]!;
    expect(noteId).toBe(drafts[0]!.noteId);
    expect(input).toMatchObject({ bookId: 'b1', comment: '声で記録した気づき', inputMethod: 'voice' });
    await waitFor(() => expect(router.state.location.pathname).toBe(`/notes/${drafts[0]!.noteId}`));
    expect(await listDrafts('uid123')).toEqual([]);
  });

  it('短すぎる録音は下書きにせず、再試行を案内する', async () => {
    installMedia();
    renderAt('/record');
    await userEvent.click(await screen.findByRole('button', { name: '録音を開始' }));
    await screen.findByText('録音中');
    now = 400;
    await userEvent.click(screen.getByRole('button', { name: '停止して内容を確認' }));
    expect(await screen.findByText(/録音が短すぎるため/)).toBeInTheDocument();
    expect(await listDrafts('uid123')).toEqual([]);
  });

  it('録音時間の上限で自動停止し、理由を表示する', async () => {
    installMedia();
    const router = renderAt('/record');
    await userEvent.click(await screen.findByRole('button', { name: '録音を開始' }));
    await screen.findByText('録音中');
    now = 120_500;
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/review\//));
    expect(await screen.findByText(/録音時間の上限（2分）に達したため/)).toBeInTheDocument();
  });

  it('キャンセルは確認のうえ破棄し、下書きを作らない', async () => {
    installMedia();
    const router = renderAt('/record');
    await userEvent.click(await screen.findByRole('button', { name: '録音を開始' }));
    await screen.findByText('録音中');
    now = 3_000;
    await screen.findByText('00:03');
    await userEvent.click(await screen.findByRole('button', { name: 'キャンセル' }));
    await userEvent.click(await screen.findByRole('button', { name: '破棄する' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(track.stop).toHaveBeenCalled();
    expect(await listDrafts('uid123')).toEqual([]);
  });

  it('確認待ちの録音があればホームに件数を表示する', async () => {
    await saveDraft({ id: 'd1', uid: 'uid123', noteId: 'n1', createdAt: Date.now(), updatedAt: Date.now(), audio: new Blob(['a']), mimeType: 'audio/webm', durationMs: 3000, size: 1, bookId: null, stopReason: 'user' });
    renderAt('/');
    expect(await screen.findByRole('link', { name: /確認待ちの録音 · 1件/ })).toHaveAttribute('href', '/review/d1');
  });

  it('24時間以上前の下書きは整理を提案し、確認後に削除する', async () => {
    const old = Date.now() - 25 * 60 * 60 * 1000;
    await saveDraft({ id: 'old', uid: 'uid123', noteId: 'n1', createdAt: old, updatedAt: old, audio: new Blob(['a']), mimeType: 'audio/webm', durationMs: 3000, size: 1, bookId: null, stopReason: 'user' });
    renderAt('/');
    expect(await screen.findByText('24時間以上前の未保存の録音が 1 件あります')).toBeInTheDocument();
    expect(await listDrafts('uid123')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: '削除する' }));
    const dialog = await screen.findByRole('dialog', { name: '古い録音を削除しますか？' });
    await userEvent.click(within(dialog).getByRole('button', { name: '削除する' }));
    await waitFor(async () => expect(await listDrafts('uid123')).toEqual([]));
  });
});
