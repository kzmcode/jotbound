import type { FirebaseOptions } from 'firebase/app';

/** 要件定義書 7章の環境変数。Firebase Web 設定は公開情報として扱う。 */
const REQUIRED_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

export type EnvKey = (typeof REQUIRED_KEYS)[number] | 'VITE_RECAPTCHA_ENTERPRISE_SITE_KEY';

export type FirebaseEnvStatus =
  | {
      ok: true;
      options: FirebaseOptions;
      recaptchaSiteKey: string | null;
      appCheckDebug: boolean;
      /** 開発・テスト専用: Auth/Firestore Emulator に接続する（App Check は使わない） */
      useEmulators: boolean;
      /** 本番ビルドで App Check を有効化できない場合に不足しているキー */
      missingForProduction: EnvKey[];
    }
  | { ok: false; missing: EnvKey[] };

type Env = Record<string, string | boolean | undefined>;

function value(env: Env, key: string): string {
  const v = env[key];
  return typeof v === 'string' ? v.trim() : '';
}

export function readFirebaseEnv(env: Env): FirebaseEnvStatus {
  const missing: EnvKey[] = REQUIRED_KEYS.filter((k) => !value(env, k));
  if (missing.length > 0) return { ok: false, missing };

  const recaptchaSiteKey = value(env, 'VITE_RECAPTCHA_ENTERPRISE_SITE_KEY') || null;
  const isProd = env.PROD === true;
  // デバッグプロバイダーは開発ビルドでのみ許可する
  const appCheckDebug = !isProd && value(env, 'VITE_APPCHECK_DEBUG') === 'true';
  const useEmulators = value(env, 'VITE_USE_EMULATORS') === 'true';

  return {
    ok: true,
    options: {
      apiKey: value(env, 'VITE_FIREBASE_API_KEY'),
      authDomain: value(env, 'VITE_FIREBASE_AUTH_DOMAIN'),
      projectId: value(env, 'VITE_FIREBASE_PROJECT_ID'),
      appId: value(env, 'VITE_FIREBASE_APP_ID'),
      messagingSenderId: value(env, 'VITE_FIREBASE_MESSAGING_SENDER_ID') || undefined,
    },
    recaptchaSiteKey,
    appCheckDebug,
    useEmulators,
    missingForProduction: recaptchaSiteKey ? [] : ['VITE_RECAPTCHA_ENTERPRISE_SITE_KEY'],
  };
}

export const firebaseEnv = readFirebaseEnv(import.meta.env);

/** Google Books API キー（任意）。Books API のみに制限したキーを使う。未設定なら書誌検索は使えない。 */
export const booksApiKey: string | null = (import.meta.env.VITE_GOOGLE_BOOKS_API_KEY ?? '').trim() || null;

export type AppCheckState = 'recaptcha-enterprise' | 'debug' | 'emulator' | 'not-configured';

export function appCheckState(status: FirebaseEnvStatus = firebaseEnv): AppCheckState {
  if (!status.ok) return 'not-configured';
  if (status.useEmulators) return 'emulator';
  if (status.appCheckDebug) return 'debug';
  return status.recaptchaSiteKey ? 'recaptcha-enterprise' : 'not-configured';
}
