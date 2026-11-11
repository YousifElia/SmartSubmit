import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

/**
 * Tests against a real sync server. Opt-in: see tests/live/sync.live.test.ts
 * for the environment variables they need.
 */
export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/live/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
