import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { signUp } from './helpers';

test('rota protegida sem sessão leva ao login; cadastro leva ao onboarding', async ({ page }) => {
  await page.goto('/hoje');
  await expect(page).toHaveURL(/\/entrar$/);
  await page.getByRole('link', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/cadastro$/);
  await signUp(page);

  // Onboarding incompleto: o app sempre volta para /onboarding (ADR-020).
  await page.goto('/hoje');
  await expect(page).toHaveURL(/\/onboarding$/);
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
