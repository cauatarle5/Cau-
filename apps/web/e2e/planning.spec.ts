import { expect, test, type Locator, type Page } from '@playwright/test';

import { completeOnboarding, signUp } from './helpers';

test.beforeEach(async ({ page }) => {
  await signUp(page);
  await completeOnboarding(page);
});

/** Número pt-BR de um texto como "1.234 kcal" ou "12 kcal acima" (acima = negativo). */
function kcalOf(text: string): number {
  const n = Number((/[\d.]+/.exec(text)?.[0] ?? '0').replaceAll('.', ''));
  return text.includes('acima') ? -n : n;
}

async function addFood(page: Page, slot: string, query: string, food: RegExp, grams: string) {
  const card = page.getByLabel(slot, { exact: true });
  await card.getByLabel(`Adicionar em ${slot}`).fill(query);
  await card
    .getByRole('list', { name: `Resultados para ${slot}` })
    .getByRole('button', { name: food })
    .first()
    .click();
  const name =
    (await card
      .getByRole('textbox', { name: /^Gramas de / })
      .last()
      .getAttribute('aria-label')) ?? '';
  await card.getByRole('textbox', { name }).fill(grams);
  return card;
}

/** O painel arredonda para kcal inteiras: compara com tolerância de 1. */
async function remaining(page: Page) {
  return kcalOf((await page.getByTestId('remaining-kcal').textContent()) ?? '');
}

async function planDraft(card: Locator) {
  await card.getByRole('button', { name: 'Planejar', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Planejar', exact: true })).toHaveCount(0);
}

test('DoD Fase 4: planejar o dia, restante em tempo real e sugestão ao passar a gordura', async ({
  page,
}) => {
  await page.goto('/nutricao/planejar');
  await expect(page.getByTestId('remaining-kcal')).toBeVisible();
  const start = await remaining(page);

  // Almoço: frango 100 g (159 kcal) → 200 g (318 kcal), mudando ao digitar.
  const lunch = await addFood(
    page,
    'Almoço',
    'frango grelhado',
    /^Frango, peito, sem pele, grelhado/,
    '100',
  );
  await expect
    .poll(async () => Math.abs((await remaining(page)) - (start - 159)))
    .toBeLessThanOrEqual(1);
  await lunch
    .getByRole('textbox', { name: 'Gramas de Frango, peito, sem pele, grelhado' })
    .fill('200');
  await expect
    .poll(async () => Math.abs((await remaining(page)) - (start - 318)))
    .toBeLessThanOrEqual(1);
  await planDraft(lunch);

  await planDraft(await addFood(page, 'Almoço', 'arroz cozido', /^Arroz, tipo 1, cozido/, '150'));
  await planDraft(
    await addFood(page, 'Jantar', 'frango grelhado', /^Frango, peito, sem pele, grelhado/, '120'),
  );
  // 318 + 192 + 190,8 = 700,8 kcal planejadas.
  await expect
    .poll(async () => Math.abs((await remaining(page)) - (start - 701)))
    .toBeLessThanOrEqual(1);

  // Café com muita muçarela: passa a meta de gordura e sugere troca.
  const breakfast = await addFood(page, 'Café da manhã', 'mussarela', /^Queijo, mozarela/, '300');
  await expect(breakfast.getByTestId('item-alert')).toContainText('passa a meta de gordura');
  await planDraft(breakfast);
  const alert = breakfast.getByTestId('item-alert');
  await expect(alert).toContainText('passa a meta de gordura');
  await alert.getByRole('button', { name: 'Ver trocas' }).click();
  const swaps = breakfast.getByRole('list', { name: 'Trocas sugeridas' });
  // Ricota: proteína ≥ 90% → 485 g; reduz a gordura mantendo a proteína.
  await expect(swaps.getByRole('listitem').first()).toContainText('485 g de Queijo, ricota');
  await swaps.getByRole('button', { name: 'Trocar' }).first().click();
  await expect(breakfast.getByRole('textbox', { name: 'Gramas de Queijo, ricota' })).toHaveValue(
    '485',
  );
  await expect(breakfast.getByTestId('item-alert')).toHaveCount(0);

  // Planejada → consumida.
  await breakfast.getByRole('button', { name: 'Registrar' }).click();
  await expect(breakfast).toContainText('registrado');
});

test('receita por texto, valores por porção e registro de 1 porção', async ({ page }) => {
  await page.goto('/nutricao/receitas');
  await page.getByRole('button', { name: 'Nova receita' }).click();
  await page.getByLabel('Nome').fill('Frango com arroz');
  await page.getByLabel('Porções').fill('2');
  await page.getByLabel('Ingredientes').fill('200g de frango, 100g de arroz');
  await page.getByRole('button', { name: 'Adicionar ingredientes' }).click();
  await expect(
    page.getByRole('list', { name: 'Ingredientes da receita' }).getByRole('listitem'),
  ).toHaveCount(2);
  // 159 × 2 + 128 = 446 kcal; porção de 150 g = 223 kcal.
  await expect(page.getByLabel('Prévia da receita')).toContainText('446 kcal');
  await page.getByRole('button', { name: 'Salvar receita' }).click();

  const card = page.getByLabel('Frango com arroz', { exact: true });
  await expect(card.getByTestId('recipe-serving')).toContainText('Porção: 223 kcal');
  await card.getByRole('button', { name: 'Registrar 1 porção' }).click();
  await expect(card.getByRole('status')).toContainText('1 porção registrada');

  await page.goto('/hoje');
  await expect(page.getByRole('img', { name: /^223 de / })).toBeVisible();
});
