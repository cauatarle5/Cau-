import { expect, test } from '@playwright/test';

import { completeOnboarding, signUp } from './helpers';

// API sobe com AI_FAKE=true (playwright.config): Coach roteirizado, números dos dados reais.
test('Coach: pergunta em streaming, proposta de refeição aplicada aparece na Nutrição', async ({
  page,
}) => {
  await signUp(page);
  await completeOnboarding(page);

  await page.goto('/coach');
  await page.getByRole('button', { name: 'Como foi minha semana?' }).click();
  const messages = page.getByRole('list', { name: 'Mensagens' });
  await expect(messages.getByRole('listitem').first()).toContainText('Como foi minha semana?');
  await expect(messages.getByRole('listitem').nth(1)).toContainText('treinos');

  await page
    .getByLabel('Pergunte ao Coach')
    .fill('Registra no almoço: 200 g de arroz e 150 g de frango');
  await page.getByRole('button', { name: 'Enviar' }).click();
  const card = page.getByRole('article', { name: /^Proposta: Registrar almoço/ });
  await expect(card).toContainText('Arroz');
  await expect(card).toContainText('200 g');
  await card.getByRole('button', { name: 'Aplicar' }).click();
  await expect(card.getByRole('status')).toContainText('Aplicado');

  // A conversa persiste ao recarregar, com o cartão resolvido.
  await page.reload();
  await expect(
    page.getByRole('article', { name: /^Proposta: Registrar almoço/ }).getByRole('status'),
  ).toContainText('Aplicado');

  await card
    .getByRole('link', { name: 'Ver' })
    .click()
    .catch(() => page.goto('/nutricao'));
  await page.waitForURL('**/nutricao');
  await expect(page.getByText('Arroz, tipo 1, cozido').first()).toBeVisible();
});
