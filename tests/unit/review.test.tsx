import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { extractionContext, matchBook, matchTags, reviewFromExtraction } from '../../src/features/review/extractionDraft';
import { parseExtraction } from '../../src/services/ai/extraction';
import { ExtractionError } from '../../src/services/ai/types';
import { getDraft, listDrafts, saveDraft } from '../../src/storage/drafts';
import { sampleResponse } from './aiSample';
import { makeBook, makeNote, makeTag, renderAt } from './helpers';
import { mockAI, mockDb, mockRepo } from './mockRepos';

const memo = (over: Record<string, unknown> = {}) => parseExtraction(JSON.stringify({ ...sampleResponse, ...over }));

describe('書名の照合', () => {
  const books = [
    makeBook({ id: 'b1' }),
    makeBook({ id: 'b2', title: '教育とは何か', titleNormalized: '教育とは何か', aliases: ['きょういくとは'] }),
    makeBook({ id: 'b3', title: '教育とは何か 第2版', titleNormalized: '教育とは何か第2版' }),
  ];

  it('正規化した書名・別名の一致で1冊に決める', () => {
    expect(matchBook('静かな「読書の技法」', books)).toEqual({ kind: 'exact', bookId: 'b1' });
    expect(matchBook('キョウイクとは', books)).toEqual({ kind: 'exact', bookId: 'b2' });
  });

  it('部分一致が1冊なら partial、複数なら人が選ぶ', () => {
    expect(matchBook('読書の技法', books)).toEqual({ kind: 'partial', bookId: 'b1' });
    expect(matchBook('教育とは', books)).toEqual({ kind: 'ambiguous', bookIds: ['b2', 'b3'] });
  });

  it('見つからない・書名の発話なし', () => {
    expect(matchBook('存在しない本', books)).toEqual({ kind: 'none' });
    expect(matchBook(null, books)).toEqual({ kind: 'noMention' });
    expect(matchBook('教', books)).toEqual({ kind: 'none' });
  });
});

describe('タグ候補と確認フォームの初期値', () => {
  const tags = [makeTag({ id: 't1', name: '教育' }), makeTag({ id: 'u1', name: '授業', normalizedName: '授業', category: 'usage' })];

  it('既存タグを優先し、一致しない候補は提案に回す（自動で作成しない）', () => {
    expect(matchTags(['教育', 'デザイン', 'デザイン'], tags, 'topic')).toEqual({
      selected: [{ id: 't1', name: '教育', isNew: false }],
      proposals: ['デザイン'],
    });
    // 種類が違う既存タグには対応付けない
    expect(matchTags(['授業'], tags, 'topic').proposals).toEqual(['授業']);
  });

  it('抽出結果からフォームを作る。書名がなければ録音時の本を使う', () => {
    const r = reviewFromExtraction(memo(), [makeBook()], tags, null);
    expect(r.form).toMatchObject({ bookId: 'b1', pageStart: '70', pageEnd: '', usageStatus: 'planned', inputMethod: 'voice' });
    expect(r.form.topicTags.map((t) => t.id)).toEqual(['t1']);
    expect(r.form.usageTags.map((t) => t.id)).toEqual(['u1']);
    expect(reviewFromExtraction(memo({ bookMention: null }), [makeBook()], tags, 'b1').form.bookId).toBe('b1');
    // 書名が話されたのに見つからないときは、録音時の本で埋めない
    expect(reviewFromExtraction(memo({ bookMention: '別の本' }), [makeBook()], tags, 'b1').form.bookId).toBe('');
  });

  it('補助文脈は選択中・読書中の本を優先し、件数を制限する', () => {
    const many = Array.from({ length: 30 }, (_, i) => makeBook({ id: `x${i}`, title: `本${i}`, readingStatus: 'unread' }));
    const ctx = extractionContext([...many, makeBook({ id: 'r', readingStatus: 'reading' }), makeBook({ id: 's', readingStatus: 'unread' })], [makeNote({ bookId: 'x5' })], tags, 's');
    expect(ctx.candidateBooks).toHaveLength(20);
    expect(ctx.candidateBooks.slice(0, 3).map((b) => b.id)).toEqual(['s', 'r', 'x5']);
    expect(ctx.existingTags).toHaveLength(2);
  });
});

const audioDraft = (over: Record<string, unknown> = {}) => ({
  id: 'd1',
  uid: 'uid123',
  noteId: 'n1',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  audio: new Blob(['audio'], { type: 'audio/webm' }),
  mimeType: 'audio/webm;codecs=opus',
  durationMs: 5000,
  size: 5,
  bookId: null,
  stopReason: 'user' as const,
  ...over,
});

const consent = () => localStorage.setItem('rn.aiConsent', '1');

describe('確認画面（AI 抽出）', () => {
  it('初回は送信の説明を表示し、同意するまで送信しない。同意すると1回解析して反映する', async () => {
    mockDb.books = [makeBook()];
    mockDb.tags = [makeTag()];
    mockAI.extract.mockResolvedValue(memo());
    await saveDraft(audioDraft());
    renderAt('/review/d1');
    expect(await screen.findByRole('heading', { name: '音声を AI で解析します' })).toBeInTheDocument();
    expect(mockAI.extract).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '同意して解析する' }));
    expect(await screen.findByRole('combobox', { name: /書籍/ })).toHaveValue('b1');
    expect(mockAI.extract).toHaveBeenCalledTimes(1);
    const input = mockAI.extract.mock.calls[0]![0] as { mimeType: string; candidateBooks: unknown[] };
    expect(input.mimeType).toBe('audio/webm;codecs=opus');
    expect(input.candidateBooks).toEqual([{ id: 'b1', title: '静かな読書の技法' }]);
    expect(screen.getByRole('textbox', { name: 'ページ' })).toHaveValue('70');
    expect(screen.getByRole('textbox', { name: /引用・記録した言葉/ })).toHaveValue(sampleResponse.quote);
    expect(screen.getByRole('textbox', { name: '自分のコメント' })).toHaveValue('次の授業の参考にしたい。');
    expect(screen.getByRole('button', { name: '教育 を外す' })).toBeInTheDocument();
    expect(screen.getByTestId('book-match')).toHaveAttribute('data-kind', 'exact');
    expect(localStorage.getItem('rn.aiConsent')).toBe('1');
    // 解析結果は端末の下書きに残る（あとで開いても再解析しない）
    expect((await getDraft('d1', 'uid123'))?.analysis).toMatchObject({ attempts: 1, lastError: null });
  });

  it('AI の提案タグは選んだときだけ新規タグになり、保存時に文字起こしと一緒に保存する', async () => {
    consent();
    mockDb.books = [makeBook()];
    mockAI.extract.mockResolvedValue(memo());
    await saveDraft(audioDraft());
    const router = renderAt('/review/d1');
    const add = await screen.findByRole('button', { name: '教育 を追加' });
    expect(screen.getByRole('button', { name: '授業 を追加' })).toBeInTheDocument();
    await userEvent.click(add);
    await userEvent.click(screen.getByRole('button', { name: '内容を確認して保存' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/notes/n1'));
    const [, noteId, input, newTags] = mockRepo.saveNewNote.mock.calls[0]!;
    expect(noteId).toBe('n1');
    expect(input).toMatchObject({ bookId: 'b1', pageStart: 70, transcript: sampleResponse.transcript, inputMethod: 'voice', usageStatus: 'planned' });
    expect(newTags).toEqual([expect.objectContaining({ name: '教育', category: 'topic' })]);
    expect(await listDrafts('uid123')).toEqual([]);
  });

  it('429 は無料枠の説明を出し、自動で再試行しない。再試行は利用者が選ぶ', async () => {
    consent();
    mockDb.books = [makeBook()];
    mockAI.extract.mockRejectedValueOnce(new ExtractionError('quota')).mockResolvedValueOnce(memo());
    await saveDraft(audioDraft());
    renderAt('/review/d1');
    expect(await screen.findByText(/本日の無料利用枠/)).toBeInTheDocument();
    expect(screen.getByText('録音は端末に残っています。再試行するか、手入力で続けられます。')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(mockAI.extract).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: '再試行する' }));
    expect(await screen.findByRole('combobox', { name: /書籍/ })).toHaveValue('b1');
    expect(mockAI.extract).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['forbidden', /App Check の設定/],
    ['tooLarge', /もっと短く録音し直してください/],
    ['invalidResponse', /応答の形式が正しくありませんでした/],
    ['offline', /通信できませんでした/],
  ] as const)('%s のエラーを区別して説明する', async (kind, text) => {
    consent();
    mockAI.extract.mockRejectedValue(new ExtractionError(kind));
    await saveDraft(audioDraft());
    renderAt('/review/d1');
    expect(await screen.findByText(text)).toBeInTheDocument();
    if (kind === 'tooLarge') expect(screen.getByRole('link', { name: '短く録音し直す' })).toBeInTheDocument();
  });

  it('一度送信した下書きは、開き直しても自動で再送しない', async () => {
    consent();
    await saveDraft(audioDraft({ analysis: { attempts: 1, result: null, lastError: 'offline', updatedAt: 1 } }));
    renderAt('/review/d1');
    expect(await screen.findByText(/通信できませんでした/)).toBeInTheDocument();
    expect(mockAI.extract).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '手入力で続ける' }));
    expect(await screen.findByRole('textbox', { name: '自分のコメント' })).toHaveValue('');
  });

  it('書名が本棚にないときは自動で選ばず、登録へ案内する。複数候補なら選ばせる', async () => {
    consent();
    mockDb.books = [makeBook(), makeBook({ id: 'b2', title: '教育とは何か', titleNormalized: '教育とは何か' }), makeBook({ id: 'b3', title: '教育とは何か 新版', titleNormalized: '教育とは何か新版' })];
    mockAI.extract.mockResolvedValue(memo({ bookMention: '教育とは' }));
    await saveDraft(audioDraft({ bookId: 'b1' }));
    renderAt('/review/d1');
    const notice = await screen.findByTestId('book-match');
    expect(notice).toHaveAttribute('data-kind', 'ambiguous');
    expect(screen.getByRole('combobox', { name: /書籍/ })).toHaveValue('');
    await userEvent.click(within(notice).getByRole('button', { name: '教育とは何か 新版' }));
    expect(screen.getByRole('combobox', { name: /書籍/ })).toHaveValue('b3');
  });

  it('本棚にない本は、入力内容を残して登録画面へ移る', async () => {
    consent();
    mockDb.books = [makeBook()];
    mockAI.extract.mockResolvedValue(memo({ bookMention: '新しい本' }));
    await saveDraft(audioDraft());
    const router = renderAt('/review/d1');
    expect(await screen.findByText('「新しい本」は本棚に見つかりませんでした。登録済みの本を選ぶか、新しく登録してください。')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'この本を登録する' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/books/new'));
    expect(router.state.location.state).toEqual({ title: '新しい本', returnTo: '/review/d1' });
    expect((await getDraft('d1', 'uid123'))?.form?.quote).toBe(sampleResponse.quote);
  });

  it('再解析は無料枠を使う旨を確認してから送る', async () => {
    consent();
    mockDb.books = [makeBook()];
    mockAI.extract.mockResolvedValueOnce(memo()).mockResolvedValueOnce(memo({ comment: '研究にも使える。' }));
    await saveDraft(audioDraft());
    renderAt('/review/d1');
    await screen.findByRole('combobox', { name: /書籍/ });
    await userEvent.click(screen.getByRole('button', { name: '再解析' }));
    const dialog = await screen.findByRole('dialog', { name: 'もう一度解析しますか？' });
    expect(within(dialog).getByText(/無料枠を1回分使います/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '再解析する' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: '自分のコメント' })).toHaveValue('研究にも使える。'));
    expect((await getDraft('d1', 'uid123'))?.analysis?.attempts).toBe(2);
  });

  it('「あとで確認する」で入力途中の内容を残し、開き直すと再解析せずに復元する', async () => {
    consent();
    mockDb.books = [makeBook()];
    mockAI.extract.mockResolvedValue(memo());
    await saveDraft(audioDraft());
    const router = renderAt('/review/d1');
    const comment = await screen.findByRole('textbox', { name: '自分のコメント' });
    await userEvent.clear(comment);
    await userEvent.type(comment, '書き直したコメント');
    await userEvent.click(screen.getByRole('button', { name: 'あとで確認する' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    await router.navigate('/review/d1');
    expect(await screen.findByRole('textbox', { name: '自分のコメント' })).toHaveValue('書き直したコメント');
    expect(mockAI.extract).toHaveBeenCalledTimes(1);
  });

  it('警告・複数メモの検出・文字起こしを表示する', async () => {
    consent();
    mockDb.books = [makeBook()];
    mockAI.extract.mockResolvedValue(memo({ warnings: ['ページが聞き取りにくい'], multipleMemoDetected: true, pageStart: 0 }));
    await saveDraft(audioDraft());
    renderAt('/review/d1');
    const warnings = await screen.findByTestId('ai-warnings');
    expect(within(warnings).getByText('ページが聞き取りにくい')).toBeInTheDocument();
    expect(within(warnings).getByText(/複数のメモが含まれている可能性があります/)).toBeInTheDocument();
    expect(within(warnings).getByText(/ページの値が正しくなかったため/)).toBeInTheDocument();
    expect(screen.getByText('元の文字起こし')).toBeInTheDocument();
    expect(screen.getByText(/原文と一致することは保証されません/)).toBeInTheDocument();
  });

  it('解析を選ばずに手入力で続けられる', async () => {
    mockDb.books = [makeBook()];
    await saveDraft(audioDraft());
    renderAt('/review/d1');
    await userEvent.click(await screen.findByRole('button', { name: '解析せずに手入力する' }));
    expect(await screen.findByRole('textbox', { name: '自分のコメント' })).toHaveValue('');
    expect(screen.getByRole('button', { name: '解析する' })).toBeInTheDocument();
    expect(mockAI.extract).not.toHaveBeenCalled();
  });
});

describe('設定: AI 解析', () => {
  it('注意事項と接続確認を表示し、確認結果を伝える', async () => {
    mockAI.checkConnection.mockRejectedValueOnce(new ExtractionError('quota'));
    renderAt('/settings');
    expect(await screen.findByRole('heading', { name: 'AI 解析' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'AI 接続を確認' }));
    expect(await screen.findByText(/本日の無料利用枠/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'AI 接続を確認' }));
    expect(await screen.findByText('AI に接続できました。')).toBeInTheDocument();
  });
});
