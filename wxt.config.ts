import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { ATS_HOST_PATTERNS } from './src/core/sites';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  // Explicit imports everywhere: the code stays plain TypeScript that tsc and
  // vitest resolve without any auto-import magic.
  imports: false,
  modules: ['@wxt-dev/module-react'],
  manifestVersion: 3,
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ browser }) => ({
    name: 'SmartSubmit',
    short_name: 'SmartSubmit',
    description:
      'Autofill job applications, remember your answers, and tailor your resume with Claude or a local model.',
    permissions: ['storage', 'unlimitedStorage', 'activeTab', 'scripting', 'alarms', 'clipboardWrite'],
    host_permissions: [...ATS_HOST_PATTERNS, 'http://localhost/*', 'http://127.0.0.1/*'],
    // Requested at runtime only, and only for the single origin involved, when
    // you point the local-model setting at a machine other than localhost.
    optional_host_permissions: ['*://*/*'],
    action: { default_title: 'SmartSubmit' },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'smartsubmit@yousifelia.github.io',
              strict_min_version: '128.0',
            },
          },
        }
      : { minimum_chrome_version: '116' }),
  }),
});
