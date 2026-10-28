import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const firebase = JSON.parse(readFileSync('firebase.json', 'utf8')) as {
  hosting: { headers: { source: string; headers: { key: string; value: string }[] }[] };
};
const all = firebase.hosting.headers.find((h) => h.source === '**')!.headers;
const header = (key: string) => all.find((h) => h.key === key)?.value ?? '';

describe('Hosting のセキュリティヘッダー', () => {
  it('CSP の script-src は index.html のインラインスクリプトのハッシュと一致する（変更したら更新が必要）', () => {
    const html = readFileSync('index.html', 'utf8');
    const inline = /<script>([\s\S]*?)<\/script>/.exec(html)![1]!;
    const hash = createHash('sha256').update(inline).digest('base64');
    expect(header('Content-Security-Policy')).toContain(`'sha256-${hash}'`);
  });

  it('基本のヘッダーと、埋め込み・プラグインの禁止を含む', () => {
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    const csp = header('Content-Security-Policy');
    for (const d of ["object-src 'none'", "base-uri 'self'", "frame-ancestors 'self'", "default-src 'self'"]) expect(csp).toContain(d);
    expect(csp).not.toContain("'unsafe-eval'");
  });
});
