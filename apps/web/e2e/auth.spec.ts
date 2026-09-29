import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

const password = 'senha-segura-123';

test('cadastro, logout e login pelo navegador', async ({ page }) => {
  const email = `e2e-${randomUUID()}@example.com`;

  // Rota protegida sem sessão leva ao login.
  await page.goto('/hoje');
  await expect(page).toHaveURL(/\/entrar$/);

  await page.getByRole('link', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/cadastro$/);
  await page.getByLabel('Nome').fill('Pessoa E2E');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Criar conta' }).click();

  await expect(page).toHaveURL(/\/hoje$/);
  await expect(page.getByRole('heading', { name: 'Hoje', level: 1 })).toBeVisible();

  // Navegação inferior (mobile).
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Treino' })
    .click();
  await expect(page.getByRole('heading', { name: 'Treino', level: 1 })).toBeVisible();

  // Sessão sobrevive a recarregar.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Treino', level: 1 })).toBeVisible();

  await page.getByRole('link', { name: 'Perfil' }).click();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/entrar$/);

  await page.goto('/hoje');
  await expect(page).toHaveURL(/\/entrar$/);

  await page.getByLabel('E-mail').fill(email.toUpperCase());
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/hoje$/);
});

test('login com senha errada mostra erro', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(`e2e-${randomUUID()}@example.com`);
  await page.getByLabel('Senha').fill('senha-errada-000');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'E-mail ou senha incorretos.' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/entrar$/);
});

test('cadastro valida campos no cliente', async ({ page }) => {
  await page.goto('/cadastro');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Informe seu nome')).toBeVisible();
  await expect(page.getByText('A senha deve ter pelo menos 8 caracteres')).toBeVisible();
});
