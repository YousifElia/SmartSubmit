// Renders the SmartSubmit mark to the PNG sizes browsers expect.
// Usage: node scripts/make-icons.mjs
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../public/icon');
mkdirSync(outDir, { recursive: true });

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#4f2bcc"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="15" fill="url(#g)"/>
  <rect x="14" y="17" width="24" height="5" rx="2.5" fill="#fff" opacity=".55"/>
  <rect x="14" y="29.5" width="15" height="5" rx="2.5" fill="#fff" opacity=".55"/>
  <path d="M15.5 45.5l7.2 7 26-27.5" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const browser = await chromium.launch();
try {
  for (const size of [16, 32, 48, 96, 128]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    await page.screenshot({ path: resolve(outDir, `${size}.png`), omitBackground: true });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(`Icons written to ${outDir}`);
