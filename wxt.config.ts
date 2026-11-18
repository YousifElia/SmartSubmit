import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { ATS_HOST_PATTERNS } from './src/core/sites';

/**
 * The public half of the key that fixes SmartSubmit's extension ID in Chrome
 * (henggcjkamgnddjcjhfnfbgfecmankpd). Without it, Chrome derives the ID from
 * the folder an unpacked extension is loaded from, so a new version loaded
 * from another folder would start with empty storage. Public by design; the
 * Chrome Web Store sets its own key, so leave it out of a store upload.
 */
const CHROME_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAshbzWH2OZ67tmStisYRV4t2IZHaFCnqKrW2uIzF/lAPQ8XkHWm2eQFXX9tpktymkGdEqhUp4wspPwm95cNcmGB/gErFpovurHVN5PBLtoS6hGn1I1NTSArexHCK1tnzcFdffWPacskQhQLEUUIpZ08gTudoKl0j1HxWB4BZsoEv2e/Z7Op1ECdEDYXCyGHILhCtqiXfDbHONDpqYT3S6ox5Xhov/f1Ri43NN27CBLQFUyNI2tcOIQvaL7XB7nBEV0pXZxnjzW8+gELaWgyXWbXnugtmYQXBiZ58qtAsdAoh8UdZupJqlQdNy6aF11poMHubqpqrDri9shhz0vO/hMQIDAQAB';

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
  manifest: ({ browser, mode }) => ({
    name: 'SmartSubmit',
    short_name: 'SmartSubmit',
    description:
      'Autofill job applications, remember your answers, and tailor your resume with Claude or a local model.',
    permissions: ['storage', 'unlimitedStorage', 'activeTab', 'scripting', 'alarms', 'clipboardWrite'],
    host_permissions: [
      ...ATS_HOST_PATTERNS,
      'http://localhost/*',
      'http://127.0.0.1/*',
      // End-to-end test builds only (`--mode e2e`): the tests cannot click the
      // toolbar button, which is what normally grants access to an unknown
      // site, so the test build may reach the reserved `.example` domain.
      ...(mode === 'e2e' ? ['*://*.example/*'] : []),
    ],
    // Requested at runtime only, and only for the single origin involved, when
    // you point the local-model setting at a machine other than localhost.
    optional_host_permissions: ['*://*/*'],
    action: { default_title: 'SmartSubmit' },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'smartsubmit@yousifelia.github.io',
              // The first version with Firefox's built-in data consent.
              strict_min_version: '140.0',
              // Nothing leaves the browser unless the person turns on sync, or
              // points AI at a model on another machine; Firefox asks first
              // (see src/core/consent.ts).
              data_collection_permissions: {
                required: ['none'],
                optional: ['personallyIdentifyingInfo', 'websiteContent'],
              },
            },
            gecko_android: { strict_min_version: '142.0' },
          },
        }
      : { minimum_chrome_version: '116', key: CHROME_KEY }),
  }),
});
