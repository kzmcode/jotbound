import { describe, expect, it, vi } from 'vitest';
import { deleteDraft, getDraft, listDrafts, saveDraft, updateDraft } from '../../src/storage/drafts';

const base = {
  uid: 'uid123',
  noteId: 'note1',
  createdAt: 1,
  updatedAt: 1,
  mimeType: 'audio/mp4',
  durationMs: 3000,
  size: 4,
  bookId: null,
  stopReason: 'user' as const,
};

describe('録音の下書き（IndexedDB）', () => {
  it('音声は ArrayBuffer で保存し、読み出すときに同じ形式の Blob に戻す（iOS Safari 対策）', async () => {
    await saveDraft({ id: 'd1', ...base, audio: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/mp4' }) });
    const draft = await getDraft('d1', 'uid123');
    expect(draft?.audio).toBeInstanceOf(Blob);
    expect(draft?.audio.type).toBe('audio/mp4');
    expect([...new Uint8Array(await draft!.audio.arrayBuffer())]).toEqual([1, 2, 3, 4]);

    await updateDraft('d1', { bookId: 'b1' });
    expect((await getDraft('d1', 'uid123'))?.audio.size).toBe(4);
    const [summary] = await listDrafts('uid123');
    expect(summary).not.toHaveProperty('audio');
    expect(summary).not.toHaveProperty('audioData');
    await deleteDraft('d1');
  });

  it('別のアカウントの下書きは一覧にも出ず、開けない。UID のない古い下書きは最初に開いたアカウントのものになる', async () => {
    const audio = new Blob(['a']);
    await saveDraft({ id: 'mine', ...base, audio });
    await saveDraft({ id: 'theirs', ...base, uid: 'other', audio });
    expect((await listDrafts('uid123')).map((d) => d.id)).toEqual(['mine']);
    expect(await getDraft('theirs', 'uid123')).toBeUndefined();
    expect((await getDraft('theirs', 'other'))?.uid).toBe('other');

    // 以前の版で保存した（uid のない）下書き
    const { openDB } = await import('idb');
    const raw = await openDB('jotbound-drafts', 1);
    const { uid: _uid, ...legacy } = base;
    await raw.put('drafts', { id: 'legacy', ...legacy, createdAt: 0, audio });
    raw.close();
    expect((await listDrafts('uid123')).map((d) => d.id)).toEqual(['mine', 'legacy']);
    expect(await getDraft('legacy', 'other')).toBeUndefined();
    await deleteDraft('mine');
    await deleteDraft('theirs');
    await deleteDraft('legacy');
  });

  it('旧アプリ名（Lumiq）の DB の下書きを新しい DB へ移し、旧 DB を消す', async () => {
    const { openDB } = await import('idb');
    const old = await openDB('lumiq-drafts', 1, {
      upgrade: (d) => d.createObjectStore('drafts', { keyPath: 'id' }).createIndex('createdAt', 'createdAt'),
    });
    await old.put('drafts', { id: 'old', ...base, audioData: new ArrayBuffer(4) });
    old.close();

    // 移行は DB を最初に開いたときに行うため、モジュールを読み直す
    vi.resetModules();
    const fresh = await import('../../src/storage/drafts');
    expect((await fresh.listDrafts('uid123')).map((d) => d.id)).toEqual(['old']);
    expect((await indexedDB.databases()).map((d) => d.name)).not.toContain('lumiq-drafts');
    await fresh.deleteDraft('old');
  });
});
