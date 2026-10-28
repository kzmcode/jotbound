// .env 形式のファイルの読み書き（コメントと並び順を保ったまま値だけを更新する）
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/** KEY=VALUE を読み取る（# のコメント行・空行は無視） */
export function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) values[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

/** 既存の行は値だけ置き換え、ない項目は末尾に追加する */
export function mergeEnv(text, updates) {
  const done = new Set();
  const lines = text.split(/\r?\n/).map((line) => {
    const m = /^\s*([A-Z0-9_]+)\s*=/.exec(line);
    if (m && m[1] in updates && !done.has(m[1])) {
      done.add(m[1]);
      return `${m[1]}=${updates[m[1]]}`;
    }
    return line;
  });
  const rest = Object.keys(updates).filter((k) => !done.has(k));
  if (rest.length > 0) {
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    lines.push(...rest.map((k) => `${k}=${updates[k]}`), '');
  }
  return lines.join('\n');
}

export const ENV_FILE = '.env.local';
export const ENV_EXAMPLE = '.env.example';

export function readEnvFile(file = ENV_FILE) {
  return existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : null;
}

/** .env.local がなければ .env.example から作り、値を更新する */
export function updateEnvFile(updates, file = ENV_FILE) {
  const base = existsSync(file) ? readFileSync(file, 'utf8') : existsSync(ENV_EXAMPLE) ? readFileSync(ENV_EXAMPLE, 'utf8') : '';
  writeFileSync(file, mergeEnv(base, updates));
}

/** OWNER_UIDS=uid1,uid2 を配列に */
export const parseOwners = (value) =>
  (value ?? '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
