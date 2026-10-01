import { expect, test } from '@playwright/test';

import { completeOnboarding, signUp } from './helpers';

test('installable PWA: manifest, icons and service worker', async ({ page, request }) => {
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  const data = (await manifest.json()) as {
    display: string;
    start_url: string;
    icons: { sizes: string; purpose: string }[];
  };
  expect(data.display).toBe('standalone');
  expect(data.start_url).toBe('/hoje');
  expect(data.icons.map((i) => `${i.sizes}:${i.purpose}`)).toEqual(
    expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']),
  );
  for (const icon of ['icon-192.png', 'icon-512.png', 'maskable-512.png']) {
    expect((await request.get(`/icons/${icon}`)).headers()['content-type']).toBe('image/png');
  }

  await page.goto('/entrar');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  );
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toBe('http://localhost:3000/');
});

test('offline: visited pages reopen from cache, others show /offline', async ({
  page,
  context,
}) => {
  await signUp(page);
  await completeOnboarding(page);
  await page.getByRole('button', { name: 'Ir para Hoje' }).click();
  await expect(page.getByText('Nutrição do dia')).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // A primeira carga pode ter acontecido antes do SW assumir: recarrega para guardar a página.
  await page.reload();
  await expect(page.getByText('Nutrição do dia')).toBeVisible();

  await context.setOffline(true);
  await page.goto('/perfil');
  await expect(page.getByRole('heading', { name: 'Sem conexão' })).toBeVisible();
  await page.goto('/hoje');
  await expect(page).toHaveTitle(/Atlas/);
  await expect(page.getByRole('heading', { name: 'Sem conexão' })).toHaveCount(0);
  await context.setOffline(false);
});
