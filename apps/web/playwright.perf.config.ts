import { defineConfig } from '@playwright/test';

import base from './playwright.config';

/** Medição de desempenho (`pnpm perf`): mesmo servidor de produção do E2E. */
export default defineConfig({
  ...base,
  testDir: './perf',
  reporter: 'list',
});
