import { expect, test, type Browser } from '@playwright/test';

// LCP no celular (P13/Fase 8): Pixel 7, CPU 4× mais lenta e rede "Slow 4G" (perfil do
// Lighthouse mobile), cache frio e sem service worker. Meta: < 2,5 s.
const DEMO = { email: 'demo@atlas.app', password: 'demo-atlas-2026' };
const BUDGET_MS = 2500;
const SLOW_4G = {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
};
const SCREENS = ['/entrar', '/hoje', '/nutricao', '/treino', '/progresso'];

async function login(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(DEMO.email);
  await page.getByLabel('Senha').fill(DEMO.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/hoje');
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

test('LCP < 2.5 s on mobile (4× CPU, Slow 4G)', async ({ browser }) => {
  test.setTimeout(180_000);
  const storageState = await login(browser);
  const results: { path: string; lcpMs: number }[] = [];

  for (const path of SCREENS) {
    const ctx = await browser.newContext({
      ...test.info().project.use,
      storageState: path === '/entrar' ? undefined : storageState,
      serviceWorkers: 'block',
    });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    await page.goto(path, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle');
    const lcpMs = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let last = 0;
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) last = e.startTime;
          }).observe({ type: 'largest-contentful-paint', buffered: true });
          setTimeout(() => {
            resolve(last);
          }, 1000);
        }),
    );
    results.push({ path, lcpMs: Math.round(lcpMs) });
    if (process.env.PERF_DEBUG) {
      const entries = await page.evaluate(() =>
        performance.getEntriesByType('resource').map((e) => {
          const r = e as PerformanceResourceTiming;
          return `${String(Math.round(r.startTime)).padStart(5)} → ${String(Math.round(r.responseEnd)).padStart(5)} ${String(r.encodedBodySize).padStart(7)} ${r.name.replace(location.origin, '')}`;
        }),
      );
      console.log(path, '\n' + entries.join('\n'));
    }
    await ctx.close();
  }

  console.log(JSON.stringify(results));
  test.info().annotations.push({ type: 'lcp', description: JSON.stringify(results) });
  for (const r of results) expect(r.lcpMs, r.path).toBeLessThan(BUDGET_MS);
  for (const r of results) expect(r.lcpMs, `${r.path} sem LCP medido`).toBeGreaterThan(0);
});
