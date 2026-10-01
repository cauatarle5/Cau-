import { expect, test } from '@playwright/test';

import { completeOnboarding, signUp } from './helpers';

test('quick-log button opens the existing forms (P12.1)', async ({ page }) => {
  await signUp(page);
  await completeOnboarding(page);
  await page.getByRole('button', { name: 'Ir para Hoje' }).click();

  const fab = page.getByRole('button', { name: 'Registro rápido' });
  await fab.click();
  const dialog = page.getByRole('dialog', { name: 'Registro rápido' });
  const options = dialog.getByRole('list', { name: 'O que registrar' });
  await expect(options.getByRole('button')).toHaveText([
    'Refeição',
    'Série/Treino',
    'Check-in',
    'Peso',
    'Atividade',
    'Água',
  ]);

  await options.getByRole('button', { name: 'Peso' }).click();
  await expect(page.getByRole('dialog', { name: 'Peso' })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await options.getByRole('button', { name: 'Refeição' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Refeição' }).getByLabel('O que você comeu?'),
  ).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await fab.click();
  await options.getByRole('button', { name: 'Série/Treino' }).click();
  await expect(page).toHaveURL(/\/treino$/);

  await page.goto('/coach');
  await expect(fab).toHaveCount(0);
});
