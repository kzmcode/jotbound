#!/usr/bin/env node
// 導入の自動化（npm run setup）。Firebase CLI でできる手順を対話しながら進める。
//   1. Firebase CLI のログイン確認
//   2. Firebase プロジェクトの選択または作成（.firebaserc）
//   3. ウェブアプリの登録と Web 設定の取得（.env.local）
//   4. Firestore データベースの作成
//   5. App Check のサイトキー・Google Books API キーの入力（あとからでも可）
//   6. Security Rules とインデックスのデプロイ
// 何度実行しても安全。済んでいる手順は確認だけして進む。コンソールでしかできない設定は最後に URL つきで案内する。
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readEnvFile, updateEnvFile, ENV_FILE } from './lib/env.mjs';
import { consoleUrls, firebaseInteractive, firebaseJson, readProjectId, writeProjectId } from './lib/firebase.mjs';
import { buildRules } from './set-owner.mjs';

const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const DEFAULT_LOCATION = 'asia-northeast1';

const rl = createInterface({ input: stdin, output: stdout });
const ask = async (q, fallback = '') => (await rl.question(fallback ? `${q} [${fallback}]: ` : `${q}: `)).trim() || fallback;
const yes = async (q, def = true) => {
  const a = (await rl.question(`${q} ${def ? '(Y/n)' : '(y/N)'}: `)).trim().toLowerCase();
  return a ? a.startsWith('y') : def;
};
const step = (n, title) => console.log(`\n── ${n}. ${title} ──`);
const done = (m) => console.log(`  ✓ ${m}`);

async function chooseProject() {
  const current = readProjectId();
  if (current && (await yes(`  .firebaserc のプロジェクト「${current}」を使いますか？`))) return current;

  const projects = firebaseJson(['projects:list']);
  if (projects.length > 0) {
    console.log('  使えるプロジェクト:');
    projects.forEach((p, i) => console.log(`    ${i + 1}) ${p.projectId}${p.displayName ? `（${p.displayName}）` : ''}`));
  }
  console.log('    n) 新しく作る');
  for (;;) {
    const a = await ask('  番号を選んでください', projects.length > 0 ? '1' : 'n');
    if (a === 'n') break;
    const p = projects[Number(a) - 1];
    if (p) return p.projectId;
  }
  for (;;) {
    const id = await ask('  新しいプロジェクトID（英小文字・数字・ハイフン 6〜30文字。全世界で一意。例: jotbound-yourname）');
    if (!PROJECT_ID.test(id)) {
      console.log('  形式が正しくありません。');
      continue;
    }
    try {
      console.log('  作成しています（1分ほどかかります）…');
      firebaseJson(['projects:create', id, '--display-name', 'Jotbound']);
      return id;
    } catch (e) {
      console.log(`  作成できませんでした: ${e.message}`);
    }
  }
}

async function chooseWebApp(projectId) {
  const apps = firebaseJson(['apps:list', 'WEB', '--project', projectId]);
  if (apps.length === 1) return apps[0].appId;
  if (apps.length > 1) {
    apps.forEach((a, i) => console.log(`    ${i + 1}) ${a.displayName ?? a.appId}`));
    for (;;) {
      const a = apps[Number(await ask('  使うウェブアプリの番号', '1')) - 1];
      if (a) return a.appId;
    }
  }
  console.log('  ウェブアプリを登録しています…');
  return firebaseJson(['apps:create', 'WEB', 'Jotbound Web', '--project', projectId]).appId;
}

async function main() {
  if (!stdin.isTTY) throw new Error('npm run setup は対話形式です。ターミナルから実行してください。');
  console.log('Jotbound の導入を始めます。途中でやめても、もう一度実行すれば続きから進められます。');
  console.log('支払い情報の登録は必要ありません（Spark プランのまま使います）。');

  step(1, 'Firebase CLI のログイン');
  const accounts = firebaseJson(['login:list']);
  const email = accounts[0]?.user?.email;
  if (!email) {
    console.log('  ログインしていません。次を実行してから、もう一度 npm run setup を実行してください:\n\n    npx firebase login\n');
    return;
  }
  if (!(await yes(`  ${email} で続けますか？`))) {
    console.log('  別のアカウントを使うには: npx firebase login:add → npx firebase login:use <メールアドレス>');
    return;
  }

  step(2, 'Firebase プロジェクト');
  const projectId = await chooseProject();
  writeProjectId(projectId);
  done(`.firebaserc に ${projectId} を設定しました`);

  step(3, 'ウェブアプリと Web 設定');
  const appId = await chooseWebApp(projectId);
  const cfg = firebaseJson(['apps:sdkconfig', 'WEB', appId, '--project', projectId]).sdkConfig;
  updateEnvFile({
    VITE_FIREBASE_API_KEY: cfg.apiKey,
    // PWA・iPhone でのリダイレクトログインのため、アプリを配信するドメインにする
    VITE_FIREBASE_AUTH_DOMAIN: `${projectId}.web.app`,
    VITE_FIREBASE_PROJECT_ID: cfg.projectId,
    VITE_FIREBASE_APP_ID: cfg.appId,
    VITE_FIREBASE_MESSAGING_SENDER_ID: cfg.messagingSenderId ?? '',
    VITE_USE_EMULATORS: 'false',
  });
  done(`${ENV_FILE} に Web 設定を書き込みました（公開されても問題のない識別子です）`);

  step(4, 'Firestore データベース');
  const dbs = firebaseJson(['firestore:databases:list', '--project', projectId]);
  const existing = dbs.find((d) => d.name?.endsWith('/databases/(default)'));
  if (existing) {
    done(`作成済みです（ロケーション: ${existing.locationId}）`);
  } else {
    console.log('  ロケーションは後から変更できません。日本で使うなら asia-northeast1（東京）がおすすめです。');
    const location = await ask('  ロケーション', DEFAULT_LOCATION);
    firebaseJson(['firestore:databases:create', '(default)', '--location', location, '--project', projectId]);
    done(`作成しました（${location}）`);
  }

  step(5, 'App Check のサイトキーと Google Books API キー（あとからでも可）');
  const env = readEnvFile() ?? {};
  const urls = consoleUrls(projectId);
  const updates = {};
  if (env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY) done('App Check のサイトキーは設定済みです');
  else {
    console.log(`  AI 解析に必要です。まだなら Enter で飛ばし、docs/SETUP_JA.md の手順 6 で作ってから、もう一度 npm run setup を実行してください。\n  作成場所: ${urls.recaptcha}`);
    const key = await ask('  reCAPTCHA のキー ID（サイトキー）');
    if (key) updates.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY = key;
  }
  if (env.VITE_GOOGLE_BOOKS_API_KEY) done('Google Books API キーは設定済みです');
  else {
    console.log('  書名検索に使います（任意）。なければ Enter で飛ばしてください（docs/SETUP_JA.md の手順 10）。');
    const key = await ask('  Google Books API キー');
    if (key) updates.VITE_GOOGLE_BOOKS_API_KEY = key;
  }
  if (Object.keys(updates).length > 0) {
    updateEnvFile(updates);
    done(`${ENV_FILE} に保存しました`);
  }

  step(6, 'Security Rules とインデックス');
  if (await yes('  Firestore に反映しますか？')) {
    const owners = await buildRules();
    firebaseInteractive(['deploy', '--only', 'firestore', '--project', projectId]);
    done(owners.length > 0 ? `反映しました（所有者: ${owners.join(', ')}）` : '反映しました（所有者の限定は、初回ログイン後に手順 9 で設定します）');
  }

  console.log(`
自動でできる手順は終わりました。続けて、コンソールで次を設定してください（詳しくは docs/SETUP_JA.md）。

  手順 4  Google ログインを有効にする
          ${urls.authProviders}
  手順 5  PWA・iPhone 用のリダイレクト URI を追加する（https://${projectId}.web.app/__/auth/handler）
          ${urls.credentials}
  手順 6  App Check（reCAPTCHA キーの作成と登録）
          ${urls.recaptcha}
          ${urls.appCheck}
  手順 7  Firebase AI Logic（Gemini Developer API・認証済みユーザー限定）
          ${urls.aiLogic}

設定が済んだら:
  npm run doctor   設定の点検
  npm run deploy   公開（https://${projectId}.web.app）
`);
}

main()
  .catch((e) => {
    console.error(`\n中断しました: ${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
