import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- 型定義のない Node スクリプト
import { setOwners } from '../../scripts/set-owner.mjs';

const rules = readFileSync('firestore.rules', 'utf8');

describe('owner:set', () => {
  it('所有者UIDを設定・解除できる', () => {
    const set = setOwners(rules, ['AbC123', 'AbC123', 'xyz9']);
    expect(set).toContain("return ['AbC123', 'xyz9']; // OWNER_UIDS");
    expect(setOwners(set, [])).toContain('return []; // OWNER_UIDS');
  });

  it('firestore.rules に所有者マーカーがある', () => {
    expect(rules).toMatch(/return \[[^\]]*\]; \/\/ OWNER_UIDS/);
  });

  it('不正なUIDは拒否（Rules への注入を防ぐ）', () => {
    expect(() => setOwners(rules, ["a'] || true; //"])).toThrow();
    expect(() => setOwners('no marker', ['abc'])).toThrow();
  });
});
