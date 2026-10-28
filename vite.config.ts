/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

import pkg from './package.json' with { type: 'json' };
import { APP_DESCRIPTION, APP_NAME } from './src/app/config.ts';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    // Firebase SDK（app / auth / firestore / app-check）の共通チャンクは約 660KB（gzip 約 200KB）。
    // 起動直後のログイン確認で必ず使うため分割しても初回の転送量は減らない。Service Worker で事前キャッシュする
    chunkSizeWarningLimit: 700,
  },
  // 遅延読み込みする AI 関連は起動時に事前バンドルする（初回の解析時に開発サーバーが再読み込みしないように）
  optimizeDeps: {
    include: ['firebase/ai', 'zod'],
  },
  plugins: [
    // index.html の %APP_NAME% / %APP_DESCRIPTION% を config.ts の値に置き換える
    {
      name: 'app-meta',
      transformIndexHtml: (html) =>
        html.replaceAll('%APP_NAME%', APP_NAME).replaceAll('%APP_DESCRIPTION%', APP_DESCRIPTION),
    },
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: APP_NAME,
        short_name: APP_NAME,
        description: APP_DESCRIPTION,
        lang: 'ja',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#EFF0FA',
        theme_color: '#EFF0FA',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: '/index.html',
        // Firebase の認証ハンドラー（/__/auth/*）は SW で横取りしない
        navigateFallbackDenylist: [/^\/__\//],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/unit/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/node/**/*.test.ts'],
  },
});
