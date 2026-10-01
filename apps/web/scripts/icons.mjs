// Gera os ícones PNG do PWA a partir do desenho do `src/app/icon.svg` (ADR-060).
// Uso: node scripts/icons.mjs (precisa do Chromium do Playwright).
import { writeFile } from 'node:fs/promises';

import { chromium } from '@playwright/test';

const glyph = '<path d="M16 7 8 25h4l4-9.5 4 9.5h4z" fill="#fff"/>';
const icons = {
  // "any": cantos arredondados, como o favicon.
  any: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#2f6fd6"/>${glyph}</svg>`,
  // "maskable": fundo cheio e desenho dentro da zona segura (80%).
  maskable: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#2f6fd6"/><g transform="translate(3.2 3.2) scale(0.8)">${glyph}</g></svg>`,
};
const outputs = [
  ['any', 192, 'icon-192.png'],
  ['any', 512, 'icon-512.png'],
  ['maskable', 512, 'maskable-512.png'],
  ['maskable', 180, 'apple-touch-icon.png'],
];

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {},
);
const page = await browser.newPage();
for (const [kind, size, file] of outputs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${icons[kind]}`,
  );
  await writeFile(
    new URL(`../public/icons/${file}`, import.meta.url),
    await page.screenshot({ omitBackground: true }),
  );
}
await browser.close();
