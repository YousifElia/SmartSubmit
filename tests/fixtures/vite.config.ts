// Builds the replica application forms used by the end-to-end tests.
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = import.meta.dirname;

export default defineConfig({
  root: here,
  base: './',
  plugins: [react()],
  logLevel: 'warn',
  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        greenhouse: resolve(here, 'greenhouse.html'),
        ashby: resolve(here, 'ashby.html'),
        lever: resolve(here, 'lever.html'),
        leverPosting: resolve(here, 'lever-posting.html'),
        generic: resolve(here, 'generic.html'),
        workday: resolve(here, 'workday.html'),
        icims: resolve(here, 'icims.html'),
        icimsForm: resolve(here, 'icims-form.html'),
        icimsLogin: resolve(here, 'icims-login.html'),
        icimsJob: resolve(here, 'icims-job.html'),
      },
    },
  },
});
