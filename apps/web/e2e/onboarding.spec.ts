import { expect, test } from '@playwright/test';

import { completeOnboarding, PASSWORD, signUp, spDate } from './helpers';

test('onboarding completo mostra metas com explicação; logout e login', async ({ page }) => {
  const started = Date.now();
  const email = await signUp(page);
  await completeOnboarding(page);

  // TMB 1780; GET 2670 + 600/7 = 2755,7; −20% = 2204,6 → 2205 kcal; proteína 2,2 × 80 = 176 g.
  await expect(page.getByText('2.205')).toBeVisible();
  await expect(page.getByText('176')).toBeVisible();
  await page.getByText('Como calculamos').click();
  await expect(page.getByText('1.780 kcal (Mifflin-St Jeor)')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Exercício planejado' })).toContainText(
    'Musculação: 180 min/semana',
  );
  // DoD: onboarding em até 3 minutos (aqui automatizado, com folga).
  expect(Date.now() - started).toBeLessThan(180_000);

  await page.getByRole('button', { name: 'Ir para Hoje' }).click();
  await expect(page).toHaveURL(/\/hoje$/);
  await expect(page.getByText('Metas do dia')).toBeVisible();

  // Navegação inferior (mobile) e sessão sobrevivendo ao reload.
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Nutrição' })
    .click();
  await expect(page.getByRole('heading', { name: 'Nutrição', level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Metas do dia')).toBeVisible();

  await page.getByRole('link', { name: 'Perfil' }).click();
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText('Perder gordura')).toBeVisible();
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/entrar$/);

  await page.getByLabel('E-mail').fill(email.toUpperCase());
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/hoje$/);
});

test('condição clínica bloqueia as metas', async ({ page }) => {
  await signUp(page);
  await page.getByLabel(/Estou gestante/).check();
  await completeOnboarding(page);
  await expect(page.getByText(/não\s+gera metas de calorias e macros/)).toBeVisible();
});

test('registrar peso aparece no histórico e no gráfico', async ({ page }) => {
  await signUp(page);
  await completeOnboarding(page);
  await page.getByRole('button', { name: 'Ir para Hoje' }).click();
  await page.goto('/progresso');

  const threeDaysAgo = spDate(-3);
  await page.getByLabel('Peso (kg)').fill('79.5');
  await page.getByLabel('Data').fill(threeDaysAgo);
  await page.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByText('Registrado.')).toBeVisible();
  await expect(page.getByRole('cell', { name: '79,5 kg' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Gráfico de peso/ })).toBeVisible();

  // Variação incomum pede confirmação antes de gravar.
  await page.getByLabel('Peso (kg)').fill('90');
  await page.getByLabel('Data').fill(spDate());
  await page.getByRole('button', { name: 'Registrar' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'bem diferente da sua tendência' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('cell', { name: '90 kg' })).toBeVisible();
});
