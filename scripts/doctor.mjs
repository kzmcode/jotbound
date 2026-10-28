#!/usr/bin/env node
// 導入状態の点検（npm run doctor）。デプロイの前にも自動で実行する。
// エラーがあれば終了コード 1。警告は表示するだけで止めない。
import { existsSync, readFileSync } from 'node:fs';
import { ENV_FILE, parseOwners, readEnvFile } from './lib/env.mjs';
import { readProjectId } from './lib/firebase.mjs';

const REQUIRED = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'];
const UID_PATTERN = /^[A-Za-z0-9]{1,128}$/;

/** env・.firebaserc の値から点検結果を作る（副作用なし。テスト用に export） */
export function diagnose({ env, projectId, nodeVersion, requiredNode }) {
  const errors = [];
  const warnings = [];
  const ok = [];

  const [major, minor] = nodeVersion.replace(/^v/, '').split('.').map(Number);
  const [reqMajor, reqMinor] = requiredNode.split('.').map(Number);
  if (major < reqMajor || (major === reqMajor && minor < reqMinor)) errors.push(`Node.js ${requiredNode} 以上が必要です（現在 ${nodeVersion}）。nvm use を実行してください。`);
  else ok.push(`Node.js ${nodeVersion}`);

  if (!env) {
    errors.push(`${ENV_FILE} がありません。npm run setup を実行してください。`);
    return { errors, warnings, ok };
  }
  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length > 0) errors.push(`${ENV_FILE} に未設定の項目があります: ${missing.join(', ')}（npm run setup で設定できます）`);
  else ok.push('Firebase の Web 設定');

  if (env.VITE_USE_EMULATORS === 'true') errors.push(`${ENV_FILE} の VITE_USE_EMULATORS が true です。本番では false にしてください。`);

  if (!projectId) errors.push('.firebaserc がありません。npm run setup を実行してください。');
  else if (env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_PROJECT_ID !== projectId)
    errors.push(`.firebaserc のプロジェクト（${projectId}）と ${ENV_FILE} の VITE_FIREBASE_PROJECT_ID（${env.VITE_FIREBASE_PROJECT_ID}）が違います。`);
  else ok.push(`デプロイ先のプロジェクト: ${projectId}`);

  const id = env.VITE_FIREBASE_PROJECT_ID;
  if (id && env.VITE_FIREBASE_AUTH_DOMAIN && env.VITE_FIREBASE_AUTH_DOMAIN !== `${id}.web.app`)
    warnings.push(`VITE_FIREBASE_AUTH_DOMAIN が ${id}.web.app ではありません。ホーム画面に追加した PWA や iPhone でログインできないことがあります（docs/SETUP_JA.md の手順 5）。`);

  if (!env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY) warnings.push('VITE_RECAPTCHA_ENTERPRISE_SITE_KEY が未設定です。公開したアプリで AI 解析が使えません（docs/SETUP_JA.md の手順 6）。');
  else ok.push('App Check のサイトキー');

  if (!env.VITE_GOOGLE_BOOKS_API_KEY) warnings.push('VITE_GOOGLE_BOOKS_API_KEY が未設定です。書名検索は使えず、手入力での登録になります（任意）。');
  else ok.push('Google Books API キー');

  const owners = parseOwners(env.OWNER_UIDS);
  const badOwners = owners.filter((u) => !UID_PATTERN.test(u));
  if (badOwners.length > 0) errors.push(`OWNER_UIDS の形式が正しくありません: ${badOwners.join(', ')}`);
  else if (owners.length === 0)
    warnings.push('OWNER_UIDS が未設定です。ログインした Google アカウントは誰でも、自分用のデータを作れます。初回ログイン後に npm run owner:set -- <UID> を実行してください（docs/SETUP_JA.md の手順 9）。');
  else ok.push(`所有者の限定: ${owners.length}件`);

  return { errors, warnings, ok };
}

function main() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const requiredNode = (pkg.engines?.node ?? '>=0.0').replace(/[^0-9.]/g, '');
  const result = diagnose({ env: readEnvFile(), projectId: readProjectId(), nodeVersion: process.version, requiredNode });
  for (const m of result.ok) console.log(`  ✓ ${m}`);
  for (const m of result.warnings) console.log(`  ! ${m}`);
  for (const m of result.errors) console.log(`  ✗ ${m}`);
  if (!existsSync('node_modules')) console.log('  ✗ npm install を実行してください。');
  if (result.errors.length > 0) {
    console.log(`\n設定に問題が ${result.errors.length} 件あります。`);
    process.exit(1);
  }
  console.log(result.warnings.length > 0 ? `\n使える状態です（確認事項 ${result.warnings.length} 件）。` : '\n設定に問題はありません。');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
