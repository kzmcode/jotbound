import { FirebaseError } from 'firebase/app';
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { AI_MODEL } from '../../app/config';
import { SCHEMA_VERSION } from '../../types/models';
import { getFirebase, type FirebaseServices } from './app';
import { firebaseEnv } from './config';

/**
 * Firebase SDK に触れる認証処理。AuthProvider から動的 import して初期バンドルを小さく保つ。
 */

export type SessionUser = {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
};

export type AccessResult = 'allowed' | 'forbidden';

function services(): FirebaseServices {
  const s = getFirebase();
  if (!s) throw new Error('Firebase is not configured');
  return s;
}

export function watchAuth(callback: (user: SessionUser | null) => void): () => void {
  const { auth } = services();
  // リダイレクトでのログイン結果（ポップアップ不可時のフォールバック）を回収する
  getRedirectResult(auth).catch(() => {});
  return onAuthStateChanged(auth, (u) => {
    // ログイン状態・録音の下書き・オフライン用キャッシュが自動で消されないよう、永続化を依頼する（拒否されても動作は変わらない）
    if (u) void navigator.storage?.persist?.().catch(() => false);
    callback(u ? { uid: u.uid, displayName: u.displayName, email: u.email, photoURL: u.photoURL } : null);
  });
}

/** ホーム画面から起動した PWA（iOS ではポップアップを開けない） */
export function isStandalonePwa(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Google ログイン。通常はポップアップ、PWA として起動しているときはリダイレクトを使う。
 * ポップアップがブロックされた場合もリダイレクトに切り替える。
 * リダイレクトを iOS で確実に動かすには authDomain をアプリの配信ドメインにする（docs/SETUP_JA.md 手順 3）。
 */
export async function signInWithGoogle(): Promise<void> {
  const { auth } = services();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  if (isStandalonePwa()) {
    await signInWithRedirect(auth, provider);
    return;
  }
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e instanceof FirebaseError && e.code === 'auth/popup-blocked') {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw e;
  }
}

/**
 * E2E テスト専用: Auth Emulator は署名なしの疑似 Google ID トークンを受け付ける。
 * Emulator 接続時以外は使えない（main.tsx で useEmulators のときだけ公開する）。
 */
export async function emulatorSignIn(email: string, displayName: string): Promise<void> {
  if (!firebaseEnv.ok || !firebaseEnv.useEmulators) throw new Error('emulator only');
  const token = JSON.stringify({ sub: email, email, email_verified: true, name: displayName });
  await signInWithCredential(services().auth, GoogleAuthProvider.credential(token));
}

export async function signOutUser(): Promise<void> {
  await signOut(services().auth);
}

/**
 * settings/profile を読み、Security Rules で許可された所有者か確認する。
 * 初回は既定値でプロフィールを作成する。permission-denied のみ「利用権限なし」とし、
 * オフライン等の一時的な失敗ではアプリを使えるようにする（データ操作側でエラーを表示する）。
 */
export async function verifyAccess(uid: string): Promise<AccessResult> {
  const { db } = services();
  const ref = doc(db, 'users', uid, 'settings', 'profile');
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        preferredModel: AI_MODEL,
        preferredBookId: null,
        schemaVersion: SCHEMA_VERSION,
        updatedAt: serverTimestamp(),
      });
    }
    return 'allowed';
  } catch (e) {
    if (e instanceof FirebaseError && e.code === 'permission-denied') return 'forbidden';
    return 'allowed';
  }
}

/** 利用者に表示するログインエラー文言（UI文言は copy.ts 側で持つキーを返す） */
export function authErrorKey(e: unknown): 'cancelled' | 'network' | 'unauthorizedDomain' | 'unknown' {
  if (!(e instanceof FirebaseError)) return 'unknown';
  switch (e.code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'cancelled';
    case 'auth/network-request-failed':
      return 'network';
    case 'auth/unauthorized-domain':
      return 'unauthorizedDomain';
    default:
      return 'unknown';
  }
}
