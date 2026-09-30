import { expect, test } from '@playwright/test';

import { completeOnboarding, signUp } from './helpers';

test.beforeEach(async ({ page }) => {
  await signUp(page);
  await completeOnboarding(page);
  await page.getByRole('button', { name: 'Ir para Hoje' }).click();
  await expect(page.getByText('Nutrição do dia')).toBeVisible();
});

test('DoD Fase 2: "200g de arroz, 150g de frango e 100g de feijão" em menos de 10 s, valores da TACO', async ({
  page,
}) => {
  const started = Date.now();
  await page.getByLabel('O que você comeu?').fill('200g de arroz, 150g de frango e 100g de feijão');
  await page.getByRole('button', { name: 'Ok' }).click();

  const items = page.getByRole('list', { name: 'Itens interpretados' });
  await expect(items.getByRole('combobox', { name: 'Alimento para arroz' })).toHaveValue(/.+/);
  await expect(
    items.getByRole('combobox', { name: 'Alimento para arroz' }).locator('option:checked'),
  ).toHaveText('Arroz, tipo 1, cozido');
  await expect(
    items.getByRole('combobox', { name: 'Alimento para frango' }).locator('option:checked'),
  ).toHaveText('Frango, peito, sem pele, grelhado');
  await expect(
    items.getByRole('combobox', { name: 'Alimento para feijao' }).locator('option:checked'),
  ).toHaveText('Feijão, carioca, cozido');
  // 256 + 238,5 + 76 = 570,5 kcal (exibido arredondado)
  await expect(page.getByText('571 kcal').first()).toBeVisible();
  await expect(page.getByText('P 57,8 g')).toBeVisible();

  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText(/Registrado em/)).toBeVisible();
  expect(Date.now() - started).toBeLessThan(10_000);

  // O anel reflete o consumido.
  await expect(page.getByRole('img', { name: /^571 de / })).toBeVisible();
});

test('editar a quantidade recalcula os totais em tempo real', async ({ page }) => {
  await page.getByLabel('O que você comeu?').fill('100g de arroz');
  await page.getByRole('button', { name: 'Ok' }).click();
  await expect(page.getByText('128 kcal').first()).toBeVisible();
  await page.getByLabel('Quantidade de arroz').fill('50');
  await expect(page.getByText('64 kcal').first()).toBeVisible();
});

test('busca manual, cadastro rápido de alimento e água', async ({ page }) => {
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Nutrição' })
    .click();
  await expect(page.getByRole('heading', { name: 'Nutrição', level: 1 })).toBeVisible();

  await page.getByLabel('Nome', { exact: true }).first().fill('banana');
  const results = page.getByRole('list', { name: 'Resultados da busca' });
  await results.getByRole('button', { name: /Banana, prata, crua/ }).click();
  await page.getByLabel('Banana, prata, crua (g)').fill('120');
  await page.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByText(/Banana, prata, crua registrado/)).toBeVisible();
  await expect(page.getByText('Banana, prata, crua').first()).toBeVisible();

  // Cadastro rápido (valores do rótulo)
  await page.locator('#food-search').fill('whey baunilha xyz');
  await page.getByRole('button', { name: /Não achou\? Cadastrar/ }).click();
  const form = page.getByRole('form', { name: 'Cadastrar alimento' });
  await form.getByLabel('Porção (g)').fill('30');
  await form.getByLabel('Calorias (kcal)').fill('120');
  await form.getByLabel('Proteína (g)').fill('24');
  await form.getByLabel('Carboidrato (g)').fill('3');
  await form.getByLabel('Gordura (g)').fill('1.5');
  await form.getByRole('button', { name: 'Salvar alimento' }).click();
  await page.getByLabel('whey baunilha xyz (g)').fill('30');
  await page.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByText(/whey baunilha xyz registrado/)).toBeVisible();

  await page.getByRole('button', { name: '+250 ml' }).click();
  await expect(page.getByText('250', { exact: true })).toBeVisible();
});
