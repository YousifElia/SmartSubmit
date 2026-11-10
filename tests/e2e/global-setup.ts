import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Build what the tests run against: the extension (in e2e mode) and the
 * replica application forms. Set SS_SKIP_BUILD=1 to reuse existing builds.
 */
export default function globalSetup(): void {
  if (process.env.SS_SKIP_BUILD) return;
  const cwd = resolve(import.meta.dirname, '../..');
  execSync('npx wxt build --mode e2e', { cwd, stdio: 'inherit' });
  execSync('npx vite build --config tests/fixtures/vite.config.ts', { cwd, stdio: 'inherit' });
}
