// アプリアイコンの構成（4本の角丸バー）を AURA Midnight Iris の配色で再構成し、
// PWA 用 PNG を Playwright（Chromium）で書き出す。`npm run icons` で再生成する。
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

// tokens/theme.css（dark）の値
const BG_TOP = '#25283D'; // --aura-surface
const BG_BOTTOM = '#151728'; // --aura-bg
const BAR = '#A9A1FF'; // --aura-accent
const BAR_HIGHLIGHT = '#F5F3FF'; // --aura-text

const bars = [
  { x: 229, y: 258, h: 415, fill: BAR },
  { x: 413, y: 258, h: 579, fill: BAR },
  { x: 597, y: 258, h: 579, fill: BAR_HIGHLIGHT },
  { x: 780, y: 258, h: 579, fill: BAR },
];

function iconSvg({ rounded, scale = 1 }) {
  const bg = rounded
    ? '<rect width="1100" height="1100" rx="240" fill="url(#bg)"/>'
    : '<rect width="1100" height="1100" fill="url(#bg)"/>';
  const rects = bars
    .map((b) => `<rect x="${b.x}" y="${b.y}" width="90" height="${b.h}" rx="45" fill="${b.fill}"/>`)
    .join('');
  const t = (1100 * (1 - scale)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 1100">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BG_TOP}"/><stop offset="1" stop-color="${BG_BOTTOM}"/></linearGradient></defs>
${bg}<g transform="translate(${t} ${t}) scale(${scale})">${rects}</g></svg>`;
}

const outputs = [
  { file: 'public/icons/icon-192.png', size: 192, svg: iconSvg({ rounded: true }) },
  { file: 'public/icons/icon-512.png', size: 512, svg: iconSvg({ rounded: true }) },
  // maskable: 全面背景＋中央80%のセーフゾーン内に収める
  { file: 'public/icons/icon-maskable-512.png', size: 512, svg: iconSvg({ rounded: false, scale: 0.86 }) },
  // iOS は自動で角丸にするため全面背景
  { file: 'public/icons/apple-touch-icon.png', size: 180, svg: iconSvg({ rounded: false }) },
];

await mkdir('public/icons', { recursive: true });
await writeFile('public/favicon.svg', iconSvg({ rounded: true }));

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, svg } of outputs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page.locator('svg').screenshot({ path: file, omitBackground: true });
  console.log(`wrote ${file}`);
}
await browser.close();
