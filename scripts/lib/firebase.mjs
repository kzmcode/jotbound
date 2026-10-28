// プロジェクトに含まれる Firebase CLI（firebase-tools）を呼び出す
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BIN = join('node_modules', '.bin', process.platform === 'win32' ? 'firebase.cmd' : 'firebase');

function bin() {
  if (!existsSync(BIN)) throw new Error('Firebase CLI が見つかりません。先に npm install を実行してください。');
  return BIN;
}

/** --json で実行して result を返す。失敗したら CLI のメッセージで例外にする */
export function firebaseJson(args) {
  const r = spawnSync(bin(), [...args, '--json'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    throw new Error(`firebase ${args.join(' ')} の結果を読み取れませんでした。\n${r.stderr || r.stdout}`);
  }
  if (parsed.status !== 'success') throw new Error(parsed.error ?? `firebase ${args.join(' ')} が失敗しました。`);
  return parsed.result;
}

/** 画面に出力しながら実行する（デプロイなど） */
export function firebaseInteractive(args) {
  const r = spawnSync(bin(), args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`firebase ${args.join(' ')} が失敗しました。`);
}

export const FIREBASERC = '.firebaserc';

export function readProjectId() {
  if (!existsSync(FIREBASERC)) return null;
  try {
    return JSON.parse(readFileSync(FIREBASERC, 'utf8')).projects?.default ?? null;
  } catch {
    return null;
  }
}

export function writeProjectId(projectId) {
  writeFileSync(FIREBASERC, `${JSON.stringify({ projects: { default: projectId } }, null, 2)}\n`);
}

/** コンソールの各設定画面（プロジェクトごとの URL） */
export const consoleUrls = (id) => ({
  authProviders: `https://console.firebase.google.com/project/${id}/authentication/providers`,
  authSettings: `https://console.firebase.google.com/project/${id}/authentication/settings`,
  appCheck: `https://console.firebase.google.com/project/${id}/appcheck`,
  aiLogic: `https://console.firebase.google.com/project/${id}/ailogic`,
  usage: `https://console.firebase.google.com/project/${id}/usage`,
  recaptcha: `https://console.cloud.google.com/security/recaptcha?project=${id}`,
  credentials: `https://console.cloud.google.com/apis/credentials?project=${id}`,
  booksApi: `https://console.cloud.google.com/apis/library/books.googleapis.com?project=${id}`,
});
