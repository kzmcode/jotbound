// Security Rules でアクセスできる所有者 UID の設定と、デプロイ用 Rules の生成。
//
//   npm run owner:set -- <UID> [<UID> ...]   所有者を .env.local の OWNER_UIDS に保存する
//   npm run owner:set -- --clear              所有者の限定を解除する（ログインした本人のデータのみ）
//   npm run rules:build                       firestore.rules に OWNER_UIDS を差し込み、.deploy/firestore.rules を作る
//
// firestore.rules（リポジトリに含める）には UID を書かず、デプロイのたびに .env.local の値から生成する。
// こうすると、テンプレートとして公開しても自分の UID が含まれない。
// オプション: --out <path> 生成先 / --no-owners 所有者なしで生成（テスト用）
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ENV_FILE, parseOwners, readEnvFile, updateEnvFile } from './lib/env.mjs';

const MARKER = /return \[[^\]]*\]; \/\/ OWNER_UIDS/;
// Firebase Auth の UID は最大128文字の英数字（Google ログインでは28文字）
const UID_PATTERN = /^[A-Za-z0-9]{1,128}$/;
export const DEPLOY_RULES = '.deploy/firestore.rules';

export function validateUids(uids) {
  for (const uid of uids) {
    if (!UID_PATTERN.test(uid)) throw new Error(`UID の形式が正しくありません: ${uid}`);
  }
  return [...new Set(uids)];
}

export function setOwners(rules, uids) {
  if (!MARKER.test(rules)) throw new Error('firestore.rules に OWNER_UIDS マーカーが見つかりません');
  const list = validateUids(uids)
    .map((u) => `'${u}'`)
    .join(', ');
  return rules.replace(MARKER, `return [${list}]; // OWNER_UIDS`);
}

export async function buildRules({ out = DEPLOY_RULES, owners } = {}) {
  const uids = owners ?? parseOwners(readEnvFile()?.OWNER_UIDS);
  const rules = await readFile('firestore.rules', 'utf8');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, setOwners(rules, uids));
  return uids;
}

async function main() {
  const args = process.argv.slice(2);
  const take = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args.splice(i, 2)[1] : undefined;
  };
  const has = (flag) => {
    const i = args.indexOf(flag);
    if (i >= 0) args.splice(i, 1);
    return i >= 0;
  };

  if (has('--build')) {
    const out = take('--out') ?? DEPLOY_RULES;
    const uids = await buildRules({ out, owners: has('--no-owners') ? [] : undefined });
    if (out === DEPLOY_RULES) {
      console.log(
        uids.length > 0
          ? `Security Rules を生成しました（所有者: ${uids.join(', ')}）。`
          : 'Security Rules を生成しました（所有者の限定なし: ログインした Google アカウントは、それぞれ自分のデータだけを使えます）。',
      );
    }
    return;
  }

  const clear = has('--clear');
  if (!clear && args.length === 0) {
    console.error('使い方: npm run owner:set -- <UID> [<UID> ...]  または  npm run owner:set -- --clear');
    console.error('UID はアプリの「設定 → アカウント → UID をコピー」で確認できます。');
    process.exit(1);
  }
  const uids = clear ? [] : validateUids(args);
  updateEnvFile({ OWNER_UIDS: uids.join(',') });
  console.log(clear ? `所有者の限定を解除しました（${ENV_FILE}）。` : `所有者を ${ENV_FILE} に保存しました: ${uids.join(', ')}`);
  console.log('反映するには: npm run deploy:rules');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
