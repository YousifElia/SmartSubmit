import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  // Each test launches its own browser profile with the extension loaded.
  workers: 3,
  fullyParallel: true,
  reporter: [['list']],
  use: { trace: 'off' },
});
