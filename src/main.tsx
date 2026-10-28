import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AuthProvider } from './app/auth';
import { routes } from './app/routes';
import { firebaseEnv } from './services/firebase/config';
import './styles/global.css';

// 環境変数が揃っていれば Firebase（App Check を最初に）を初期化する。SDK は別チャンクで遅延読み込み。
if (firebaseEnv.ok) void import('./services/firebase/app').then((m) => m.getFirebase());

// E2E テスト専用のログイン手段（Emulator 接続ビルドのみ。本番ビルドでは登録されない）
// import.meta.env の比較はビルド時に確定するため、本番ビルドからはこのコードごと除かれる
if (import.meta.env.VITE_USE_EMULATORS === 'true' && firebaseEnv.ok && firebaseEnv.useEmulators) {
  (window as unknown as { __jotboundEmulatorSignIn?: unknown }).__jotboundEmulatorSignIn = async (email: string, name: string) =>
    (await import('./services/firebase/session')).emulatorSignIn(email, name);
}

const router = createBrowserRouter(routes);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
);
