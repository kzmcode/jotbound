import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- 型定義のない Node スクリプト
import { diagnose } from '../../scripts/doctor.mjs';
// @ts-expect-error -- 型定義のない Node スクリプト
import { mergeEnv, parseEnv, parseOwners } from '../../scripts/lib/env.mjs';

const env = {
  VITE_FIREBASE_API_KEY: 'k',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-app.web.app',
  VITE_FIREBASE_PROJECT_ID: 'demo-app',
  VITE_FIREBASE_APP_ID: '1:2:web:3',
  VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: 's',
  VITE_GOOGLE_BOOKS_API_KEY: 'b',
  VITE_USE_EMULATORS: 'false',
  OWNER_UIDS: 'abc123',
};
const run = (over: Record<string, string> | null, projectId: string | null = 'demo-app', nodeVersion = 'v24.22.1') =>
  diagnose({ env: over === null ? null : { ...env, ...over }, projectId, nodeVersion, requiredNode: '24.22.0' }) as {
    errors: string[];
    warnings: string[];
  };

describe('.env の読み書き', () => {
  it('コメントと並び順を保ったまま値を更新し、ない項目は末尾に足す', () => {
    const text = '# コメント\nVITE_A=\nVITE_B=old\n\n# 末尾\n';
    const merged = mergeEnv(text, { VITE_B: 'new', VITE_C: 'c' });
    expect(merged).toBe('# コメント\nVITE_A=\nVITE_B=new\n\n# 末尾\nVITE_C=c\n');
    expect(parseEnv(merged)).toEqual({ VITE_A: '', VITE_B: 'new', VITE_C: 'c' });
    expect(parseEnv('X="quoted"\n  Y = spaced ')).toEqual({ X: 'quoted', Y: 'spaced' });
  });

  it('OWNER_UIDS をカンマ・空白区切りで読む', () => {
    expect(parseOwners('a1, b2  c3')).toEqual(['a1', 'b2', 'c3']);
    expect(parseOwners(undefined)).toEqual([]);
  });

  it('.env.example に setup が書き込む項目と OWNER_UIDS がある', () => {
    const example = parseEnv(readFileSync('.env.example', 'utf8'));
    for (const key of ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID', 'VITE_RECAPTCHA_ENTERPRISE_SITE_KEY', 'VITE_GOOGLE_BOOKS_API_KEY', 'OWNER_UIDS']) {
      expect(example).toHaveProperty(key);
    }
  });
});

describe('npm run doctor', () => {
  it('すべて設定済みならエラー・警告なし', () => {
    expect(run({})).toMatchObject({ errors: [], warnings: [] });
  });

  it('致命的な問題はエラーにする', () => {
    expect(run(null).errors.join()).toContain('.env.local がありません');
    expect(run({ VITE_FIREBASE_APP_ID: '' }).errors.join()).toContain('VITE_FIREBASE_APP_ID');
    expect(run({ VITE_USE_EMULATORS: 'true' }).errors.join()).toContain('VITE_USE_EMULATORS');
    expect(run({}, 'other-project').errors.join()).toContain('違います');
    expect(run({}, null).errors.join()).toContain('.firebaserc');
    expect(run({ OWNER_UIDS: "a'b" }).errors.join()).toContain('OWNER_UIDS');
    expect(run({}, 'demo-app', 'v22.1.0').errors.join()).toContain('Node.js');
  });

  it('使えるが確認が必要なものは警告にする', () => {
    expect(run({ VITE_FIREBASE_AUTH_DOMAIN: 'demo-app.firebaseapp.com' }).warnings.join()).toContain('PWA');
    expect(run({ VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: '' }).warnings.join()).toContain('AI 解析');
    expect(run({ VITE_GOOGLE_BOOKS_API_KEY: '' }).warnings.join()).toContain('書名検索');
    expect(run({ OWNER_UIDS: '' }).warnings.join()).toContain('owner:set');
    expect(run({ VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: '' }).errors).toEqual([]);
  });
});

describe('公開するテンプレート', () => {
  it('firestore.rules に個人の UID を書かない（デプロイ時に .env.local から差し込む）', () => {
    expect(readFileSync('firestore.rules', 'utf8')).toContain('return []; // OWNER_UIDS');
    const firebase = JSON.parse(readFileSync('firebase.json', 'utf8'));
    expect(firebase.firestore.rules).toBe('.deploy/firestore.rules');
  });
});
