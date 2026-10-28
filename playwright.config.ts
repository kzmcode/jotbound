import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // Auth Emulator のポップアップは高負荷で不安定になるため並列数を抑える
  workers: 4,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // 録音テスト用: 偽のマイク（Chromium の合成音声）を使い、許可ダイアログを自動承認する
    permissions: ['microphone'],
    launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } },
  ],
  // Auth / Firestore Emulator は npm run test:e2e（firebase emulators:exec）が起動・停止する
  webServer: {
    // 本番用の dist を上書きしないよう、テスト用ビルドは .e2e/dist に出力する
    command: `npx tsc -b && npx vite build --mode e2e --outDir .e2e/dist --emptyOutDir && npx vite preview --outDir .e2e/dist --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
