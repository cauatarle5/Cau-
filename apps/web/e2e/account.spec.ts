import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { completeOnboarding, PASSWORD, signUp } from './helpers';

test('logged-in user is sent from /entrar to /hoje', async ({ page }) => {
  await signUp(page);
  await completeOnboarding(page);
  await page.getByRole('button', { name: 'Ir para Hoje' }).click();
  await page.goto('/entrar');
  await expect(page).toHaveURL(/\/hoje$/);
  await page.goto('/cadastro');
  await expect(page).toHaveURL(/\/hoje$/);
});

test('exports data and deletes the account (LGPD)', async ({ page }) => {
  const email = await signUp(page);
  await completeOnboarding(page);
  await page.getByRole('button', { name: 'Ir para Hoje' }).click();
  await page.goto('/perfil');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar meus dados' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^atlas-.*\.json$/);
  const data = JSON.parse(await readFile(await download.path(), 'utf8')) as {
    user: { email: string };
    tables: Record<string, unknown[]>;
  };
  expect(data.user.email).toBe(email);
  expect(data.tables.body_measurements).toHaveLength(1);

  await page.getByRole('button', { name: 'Excluir conta' }).click();
  await page.getByLabel('Senha atual').fill('senha-errada');
  await page.getByLabel('Digite EXCLUIR para confirmar').fill('EXCLUIR');
  await page.getByRole('button', { name: 'Excluir minha conta' }).click();
  await expect(page.getByText('A senha não confere.')).toBeVisible();

  await page.getByLabel('Senha atual').fill(PASSWORD);
  await page.getByRole('button', { name: 'Excluir minha conta' }).click();
  await expect(page).toHaveURL(/\/entrar$/);

  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('E-mail ou senha incorretos')).toBeVisible();
});
