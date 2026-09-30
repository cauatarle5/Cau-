import { randomUUID } from 'node:crypto';

import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'senha-segura-123';

export async function signUp(page: Page) {
  const email = `e2e-${randomUUID()}@example.com`;
  await page.goto('/cadastro');
  await page.getByLabel('Nome').fill('Pessoa E2E');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  return email;
}

/** Faz 30 anos em 1º de janeiro deste ano (idade 30 o ano todo). */
export const birthDate30 = () => `${String(new Date().getFullYear() - 30)}-01-01`;

/** Onboarding mínimo: homem, 30 anos, 180 cm, 80 kg, moderado, perder gordura, seg/qua/sex 60 min. */
export async function completeOnboarding(page: Page) {
  await page.getByText('Masculino').click();
  await page.getByLabel('Nascimento').fill(birthDate30());
  await page.getByLabel('Altura (cm)').fill('180');
  await page.getByLabel('Peso hoje (kg)').fill('80');
  await page.getByText('Moderadamente ativo').click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  await expect(page.getByRole('heading', { name: 'Objetivo' })).toBeVisible();
  await page.getByText('Perder gordura').click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  await expect(page.getByRole('heading', { name: 'Rotina' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();

  await expect(page.getByRole('heading', { name: 'Equipamentos' })).toBeVisible();
  await page.getByRole('button', { name: 'Academia completa' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  await expect(page.getByRole('heading', { name: 'Limitações' })).toBeVisible();
  await page.getByRole('button', { name: 'Não tenho' }).click();

  await expect(page.getByRole('heading', { name: 'Esportes' })).toBeVisible();
  await page.getByRole('button', { name: 'Não pratico' }).click();
  await expect(page.getByRole('heading', { name: 'Suas metas' })).toBeVisible();
}

/** Dia no fuso padrão do usuário (America/Sao_Paulo), deslocado em `offsetDays`. */
export function spDate(offsetDays = 0): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );
}
