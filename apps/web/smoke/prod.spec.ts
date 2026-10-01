import { expect, test } from '@playwright/test';

import { completeOnboarding, signUp } from '../e2e/helpers';

// Smoke do deploy (ADR-058): roda contra a stack de produção (Caddy → web/API → Postgres).
//   SMOKE_URL=https://seu-dominio pnpm --filter @atlas/web smoke
test('production stack: sign up, onboarding, log a meal, export', async ({ page, context }) => {
  const health = await page.request.get('/api/v1/health');
  expect(await health.json()).toMatchObject({ status: 'ok', db: 'up' });

  const email = await signUp(page);
  const cookie = (await context.cookies()).find((c) => c.name === 'atlas_session');
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax' });

  await completeOnboarding(page);
  await page.getByRole('button', { name: 'Ir para Hoje' }).click();
  await expect(page.getByText('Nutrição do dia')).toBeVisible();

  // Catálogo semeado pelo release: o registro por texto encontra alimentos da TACO.
  await page.getByLabel('O que você comeu?').first().fill('100g de arroz');
  await page.getByRole('button', { name: 'Ok' }).first().click();
  await expect(page.getByText(/arroz/i).first()).toBeVisible();

  await page.goto('/perfil');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar meus dados' }).click();
  expect((await download).suggestedFilename()).toMatch(/^atlas-.*\.json$/);
  expect(email).toContain('@');
});
