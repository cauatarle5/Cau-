import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
// Ambientes com Chromium pré-instalado podem apontar o executável (sem `playwright install`).
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
// `E2E_EMBEDDED=1`: um servidor só (Next com a API embutida, como na Vercel, ADR-064).
const embedded = Boolean(process.env.E2E_EMBEDDED);
// Vários cadastros/logins seguidos do mesmo IP durante a suíte; Coach roteirizado sem rede
// (ADR-056), nunca em produção.
const API_TEST_ENV = { AUTH_RATE_LIMIT_MAX: '100', AI_FAKE: 'true' };

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    locale: 'pt-BR',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
  webServer: embedded
    ? [
        {
          // API Fastify dentro do Next, como na Vercel (ADR-064).
          command: 'pnpm --filter @atlas/web build && pnpm --filter @atlas/web start',
          url: 'http://localhost:3000/entrar',
          reuseExistingServer: !isCI,
          timeout: 300_000,
          env: {
            EMBEDDED_API: 'true',
            APP_ENV: 'test',
            DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://atlas:atlas@localhost:5432/atlas',
            WEB_ORIGIN: 'http://localhost:3000',
            ...API_TEST_ENV,
          },
        },
      ]
    : [
        {
          command: 'pnpm --filter @atlas/api dev',
          url: 'http://localhost:3001/api/v1/health',
          reuseExistingServer: !isCI,
          timeout: 60_000,
          env: API_TEST_ENV,
        },
        {
          // Build de produção por padrão: service worker, PWA e desempenho reais (ADR-060).
          // `E2E_WEB_DEV=1` usa o servidor de dev para iterar mais rápido.
          command: process.env.E2E_WEB_DEV
            ? 'pnpm --filter @atlas/web dev'
            : 'pnpm --filter @atlas/web build && pnpm --filter @atlas/web start',
          url: 'http://localhost:3000/entrar',
          reuseExistingServer: !isCI,
          timeout: 300_000,
        },
      ],
});
