import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { firebaseEnv } from './config';

export type FirebaseServices = {
  app: FirebaseApp;
  appCheck: AppCheck | null;
  auth: Auth;
  db: Firestore;
};

let services: FirebaseServices | null = null;

/**
 * Firebase を初期化する。環境変数が未設定なら null（UI は設定案内を表示する）。
 * App Check は他サービスより先に初期化する（AI Logic は 2026-11-02 から App Check 必須）。
 */
export function getFirebase(): FirebaseServices | null {
  if (services) return services;
  if (!firebaseEnv.ok) return null;

  const app = initializeApp(firebaseEnv.options);

  let appCheck: AppCheck | null = null;
  const siteKey = firebaseEnv.recaptchaSiteKey;
  if (firebaseEnv.appCheckDebug && !firebaseEnv.useEmulators) {
    // 開発専用: デバッグトークンがコンソールに出力される。Firebase コンソールで登録する。
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  if (!firebaseEnv.useEmulators && (siteKey || firebaseEnv.appCheckDebug)) {
    appCheck = initializeAppCheck(app, {
      // デバッグ時もプロバイダー指定は必要。トークン取得はデバッグトークンに置き換わる。
      provider: new ReCaptchaEnterpriseProvider(siteKey ?? 'debug'),
      isTokenAutoRefreshEnabled: true,
    });
  }

  // ログイン状態は端末に保存し、PWA を閉じても保持する（IndexedDB、使えなければ localStorage）。
  // リダイレクトでのログイン（PWA 用）に必要なリゾルバーも明示する
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  // オフラインで既取得メモを表示するため、端末内永続キャッシュを使う
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });

  // import.meta.env の比較はビルド時に確定するため、本番ビルドには Emulator の接続先が含まれない
  if (import.meta.env.VITE_USE_EMULATORS === 'true' && firebaseEnv.useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }

  services = { app, appCheck, auth, db };
  return services;
}
