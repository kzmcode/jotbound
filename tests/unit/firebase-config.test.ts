import { describe, expect, it } from 'vitest';
import { appCheckState, readFirebaseEnv } from '../../src/services/firebase/config';

const full = {
  VITE_FIREBASE_API_KEY: 'k',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo',
  VITE_FIREBASE_APP_ID: '1:2:web:3',
};

describe('readFirebaseEnv', () => {
  it('必須キーが欠けていれば不足一覧を返す', () => {
    const r = readFirebaseEnv({ VITE_FIREBASE_API_KEY: 'k', VITE_FIREBASE_PROJECT_ID: '  ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toEqual(['VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID']);
  });

  it('必須キーが揃えば Firebase オプションを組み立てる', () => {
    const r = readFirebaseEnv({ ...full, VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: 'site' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.options.projectId).toBe('demo');
      expect(r.recaptchaSiteKey).toBe('site');
      expect(r.missingForProduction).toEqual([]);
      expect(appCheckState(r)).toBe('recaptcha-enterprise');
    }
  });

  it('reCAPTCHA キーがなければ App Check 未設定として扱う', () => {
    const r = readFirebaseEnv(full);
    expect(r.ok && r.missingForProduction).toEqual(['VITE_RECAPTCHA_ENTERPRISE_SITE_KEY']);
    expect(appCheckState(r)).toBe('not-configured');
  });

  it('App Check デバッグは開発ビルドでのみ有効', () => {
    const dev = readFirebaseEnv({ ...full, VITE_APPCHECK_DEBUG: 'true', PROD: false });
    const prod = readFirebaseEnv({ ...full, VITE_APPCHECK_DEBUG: 'true', PROD: true });
    expect(appCheckState(dev)).toBe('debug');
    expect(appCheckState(prod)).toBe('not-configured');
  });
});
