import { defineConfig } from 'vitest/config';

// Firestore Emulator 上で Security Rules を検証する（npm run test:rules）
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
