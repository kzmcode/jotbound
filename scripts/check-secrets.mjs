#!/usr/bin/env node
// 公開してよいファイルに秘密情報が混ざっていないかを調べる（要件 7章・11章）。
// - .gitignore 対象（.env.local、.firebaserc など）と生成物は調べない
// - サービスアカウント鍵・秘密鍵・Google API キー・Firebase の個人設定値・デバッグトークンらしき文字列を探す
// 使い方: npm run check:secrets
//         node scripts/check-secrets.mjs --staged   コミットする内容（ステージ済み）だけを調べる（.githooks/pre-commit）
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dev-dist', '.git', '.e2e', '.deploy', '.firebase', 'ref', 'test-results', 'playwright-report']);
const SKIP_FILES = [/^\.env(\..+)?\.local$/, /^\.env\.local$/, /^\.firebaserc$/, /-debug\.log$/, /\.DS_Store$/, /^package-lock\.json$/];
// git add -f でも公開してはいけないファイル（--staged のとき、ファイル名だけで止める）
const FORBIDDEN_FILES = [/^\.env$/, /^\.env\..+\.local$/, /^\.env\.local$/, /^\.firebaserc$/, /^service-account.*\.json$/, /-firebase-adminsdk-.*\.json$/, /\.(pem|p12)$/];
const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|zip)$/i;

const RULES = [
  { name: '秘密鍵', re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
  { name: 'サービスアカウント JSON', re: /"type"\s*:\s*"service_account"/ },
  { name: 'Google API キー', re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'OAuth クライアントシークレット', re: /GOCSPX-[0-9A-Za-z_-]{20,}/ },
  { name: 'App Check デバッグトークン', re: /FIREBASE_APPCHECK_DEBUG_TOKEN\s*=\s*['"][0-9a-f-]{36}['"]/ },
  { name: '環境変数への実値の記入', re: /^VITE_(?:FIREBASE_API_KEY|FIREBASE_APP_ID|RECAPTCHA_ENTERPRISE_SITE_KEY|GOOGLE_BOOKS_API_KEY)=\S+/m },
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) yield* walk(path);
    } else if (!SKIP_FILES.some((re) => re.test(name)) && !BINARY.test(name) && st.size < 5_000_000) {
      yield path;
    }
  }
}

const staged = process.argv.includes('--staged');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 50_000_000 });

/** 調べるファイルと内容。--staged ならコミットされる内容（インデックス）を読む */
function* targets() {
  if (!staged) {
    for (const path of walk(ROOT)) yield { rel: relative(ROOT, path), read: () => readFileSync(path, 'utf8') };
    return;
  }
  const names = git('diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR').split('\0').filter(Boolean);
  for (const rel of names) {
    const name = rel.split('/').pop();
    if (FORBIDDEN_FILES.some((re) => re.test(name))) {
      findings.push(`${rel}: 公開してはいけないファイルです（git rm --cached ${rel} で取り消してください）`);
      continue;
    }
    if (SKIP_FILES.some((re) => re.test(name)) || BINARY.test(name)) continue;
    yield { rel, read: () => git('show', `:${rel}`) };
  }
}

const findings = [];
let scanned = 0;
for (const { rel, read } of targets()) {
  const text = read();
  scanned += 1;
  for (const rule of RULES) {
    const m = text.match(rule.re);
    // .env.e2e は Emulator 用の架空の値（demo- プロジェクト）なので API キー形式の検査から除く
    if (m && !(rel === '.env.e2e' && rule.name !== '秘密鍵')) findings.push(`${rel}: ${rule.name}（${m[0].slice(0, 12)}…）`);
  }
}

// 所有者 UID は .env.local の OWNER_UIDS に置く（公開するテンプレートに個人の UID を残さない）
const rules = staged ? git('show', ':firestore.rules') : readFileSync(join(ROOT, 'firestore.rules'), 'utf8');
if (/return \[\s*'[^\]]+\]; \/\/ OWNER_UIDS/.test(rules)) {
  findings.push('firestore.rules: 所有者 UID が書かれています（npm run owner:set で .env.local に移し、firestore.rules は空のリストに戻してください）');
}

if (findings.length > 0) {
  console.error(`秘密情報の可能性がある記述が ${findings.length} 件あります:\n${findings.map((f) => `  - ${f}`).join('\n')}`);
  process.exit(1);
}
console.log(
  staged
    ? `秘密情報は見つかりませんでした（コミットする ${scanned} ファイルを確認）。`
    : `秘密情報は見つかりませんでした（${scanned} ファイルを確認。.env.local などの .gitignore 対象は除外）。`,
);
