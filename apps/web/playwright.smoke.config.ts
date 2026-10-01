import { defineConfig, devices } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

/** Smoke contra um deploy já no ar (`SMOKE_URL`), sem subir servidores (ADR-058). */
export default defineConfig({
  testDir: './smoke',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.SMOKE_URL ?? 'https://localhost',
    // Stack local com DOMAIN=localhost usa a CA interna do Caddy.
    ignoreHTTPSErrors: true,
    locale: 'pt-BR',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'], launchOptions: executablePath ? { executablePath } : {} },
    },
  ],
});
