import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { authActions as auth, renderAt, testUser as user } from './helpers';

describe('ホーム', () => {
  it('アプリ名と音声メモ開始ボタンを表示し、AURA の仮称や Text/Image 入力を出さない', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: /Jotbound/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '音声メモを開始' })).toBeInTheDocument();
    expect(screen.queryByText(/aura/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Text|Image)$/ })).not.toBeInTheDocument();
  });

  it('メモ0件の空状態を表示し、確認待ちバーは0件のとき出さない', async () => {
    renderAt('/');
    expect(await screen.findByText('まだメモはありません。最初の思考を声で残しましょう。')).toBeInTheDocument();
    expect(screen.queryByText(/確認待ち/)).not.toBeInTheDocument();
  });

  it('録音ボタンで録音画面へ遷移する', async () => {
    const router = renderAt('/');
    await userEvent.click(screen.getByRole('button', { name: '音声メモを開始' }));
    expect(router.state.location.pathname).toBe('/record');
    expect(screen.queryByRole('navigation', { name: 'メインメニュー' })).not.toBeInTheDocument();
  });

  it('下部ナビは要件どおり ホーム／本棚／メモ／設定 の順で現在地を示す', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'メインメニュー' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['ホーム', '本棚', 'メモ', '設定']);
    expect(links[0]).toHaveAttribute('aria-current', 'page');
  });
});

describe('設定', () => {
  it('テーマを ライト／ダーク／端末に合わせる で切り替えられる', async () => {
    renderAt('/settings');
    await userEvent.click(screen.getByRole('radio', { name: /ダーク/ }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    await userEvent.click(screen.getByRole('radio', { name: /システム/ }));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(screen.getByRole('radio', { name: /システム/ })).toBeChecked();
  });

  it('モデル名 gemini-3.5-flash-lite を表示する', () => {
    renderAt('/settings');
    expect(screen.getByText('gemini-3.5-flash-lite')).toBeInTheDocument();
  });
});

it.each(['/books', '/books/new', '/books/abc', '/notes', '/notes/abc', '/review/d1', '/unknown'])('%s を描画できる', (path) => {
  renderAt(path);
  expect(document.body.textContent).not.toBe('');
});

describe('認証ゲート', () => {
  it('未ログインならログイン画面を出し、アプリ本体は表示しない', async () => {
    renderAt('/notes', { status: 'signedOut' });
    expect(screen.queryByRole('navigation', { name: 'メインメニュー' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Google でログイン' }));
    expect(auth.signIn).toHaveBeenCalled();
  });

  it('ログイン失敗の理由を日本語で表示する', () => {
    renderAt('/', { status: 'signedOut', error: 'network' });
    expect(screen.getByRole('alert')).toHaveTextContent('通信できませんでした');
  });

  it('所有者でないアカウントには利用不可とUIDを表示する', () => {
    renderAt('/', { status: 'forbidden', user });
    expect(screen.getByRole('heading', { name: 'このアカウントでは利用できません' })).toBeInTheDocument();
    expect(screen.getByTestId('uid')).toHaveTextContent('uid123');
    expect(screen.queryByRole('button', { name: '音声メモを開始' })).not.toBeInTheDocument();
  });

  it('Firebase 未設定なら設定案内を出す', () => {
    renderAt('/', { status: 'unconfigured' });
    expect(screen.getByText('Firebase の設定が必要です')).toBeInTheDocument();
  });

  it('確認中は読み込み表示のみ', () => {
    renderAt('/', { status: 'checking', user });
    expect(screen.getByRole('status')).toHaveTextContent('アカウントを確認しています');
  });

  it('ヘッダーにログイン状態を表示し、設定でUID確認・ログアウトできる', async () => {
    renderAt('/settings');
    expect(screen.getByRole('link', { name: 'アカウント: 鈴木（設定を開く）' })).toBeInTheDocument();
    expect(screen.getByText('owner@example.com')).toBeInTheDocument();
    expect(screen.getByTestId('uid')).toHaveTextContent('uid123');
    await userEvent.click(screen.getByRole('button', { name: 'ログアウト' }));
    expect(auth.signOut).toHaveBeenCalled();
  });
});
