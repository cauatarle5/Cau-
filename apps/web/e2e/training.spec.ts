import { expect, test, type Page } from '@playwright/test';

import { completeOnboarding, signUp } from './helpers';

test.beforeEach(async ({ page }) => {
  await signUp(page);
  await completeOnboarding(page);
  await page.goto('/treino');
  await expect(page.getByRole('heading', { name: 'Treino', exact: true })).toBeVisible();
});

async function pickExercise(page: Page, label: string, query: string, name: string) {
  await page.getByLabel(label).fill(query);
  await page
    .getByRole('list', { name: 'Exercícios encontrados' })
    .getByRole('button', { name, exact: true })
    .click();
}

test('DoD Fase 3: treino completo sem rede, sincronizado depois, progresso visível', async ({
  page,
  context,
}) => {
  // Programa com um treino: supino (2 séries) e rosca martelo.
  await page.getByRole('button', { name: 'Criar programa' }).click();
  await pickExercise(
    page,
    'Adicionar exercício ao treino 1',
    'supino reto',
    'Supino reto com barra',
  );
  await page.getByLabel('Séries de Supino reto com barra').fill('2');
  await pickExercise(page, 'Adicionar exercício ao treino 1', 'rosca martelo', 'Rosca martelo');
  await page.getByRole('button', { name: 'Salvar e ativar' }).click();

  await page.getByRole('button', { name: 'Iniciar Treino A' }).click();
  await expect(page).toHaveURL(/\/treino\/sessao\//);
  const bench = page.getByLabel('Supino reto com barra', { exact: true });
  await expect(bench.getByRole('button', { name: 'Confirmar série 1' })).toBeVisible();

  // Sem rede daqui até o fim do treino.
  await context.setOffline(true);
  await expect(page.getByTestId('sync-status')).toContainText('Sem conexão');

  await bench.getByRole('textbox', { name: 'Carga', exact: true }).fill('60');
  await bench.getByRole('textbox', { name: 'Repetições', exact: true }).fill('10');
  await bench.getByRole('button', { name: 'Confirmar série 1' }).click();
  const timer = page.getByRole('timer', { name: 'Descanso' });
  await expect(timer).toBeVisible();
  await timer.getByRole('button', { name: 'Pular' }).click();

  // Série 2 já vem com os valores da anterior: confirmar em 1 toque.
  await bench.getByRole('button', { name: 'Confirmar série 2' }).click();
  await expect(bench.getByLabel('Série 2 concluída')).toContainText('60 kg × 10');

  const curl = page.getByLabel('Rosca martelo', { exact: true });
  await curl.getByRole('button', { name: 'Pular Rosca martelo' }).click();
  await curl.getByRole('button', { name: 'Aparelho ocupado' }).click();
  await expect(curl).toContainText('pulado (Aparelho ocupado)');

  await page.getByRole('button', { name: 'Finalizar treino' }).click();
  await page
    .getByRole('group', { name: 'RPE da sessão' })
    .getByRole('button', { name: '8', exact: true })
    .click();
  await page.getByRole('button', { name: 'Salvar treino' }).click();

  const summary = page.getByLabel('Resumo do treino');
  await expect(summary).toContainText('Salvo no aparelho');
  await expect(page.getByTestId('sync-status')).toContainText('pendentes');
  // 60 × 10 × 2 = 1.200 kg, calculado no aparelho pelo core.
  await expect(page.getByTestId('summary-tonnage')).toHaveText('1.200 kg');

  // Volta a rede: a fila sincroniza.
  await context.setOffline(false);
  await expect(page.getByTestId('sync-status')).toHaveText('Tudo sincronizado', {
    timeout: 20_000,
  });
  await expect(summary).toContainText('Sem recordes desta vez.');
  await expect(summary).toContainText('RPE 8');
  await summary.getByRole('button', { name: 'Concluir' }).click();

  await expect(page).toHaveURL(/\/treino$/);
  const history = page.getByRole('list', { name: 'Histórico de treinos' });
  await expect(history).toContainText('Treino A');
  await expect(history).toContainText('2 séries');
  await expect(history).toContainText('1.200 kg');

  // Progresso por exercício: e1RM = 60 × (1 + 10/30) = 80 kg.
  await page.goto('/progresso');
  await pickExercise(page, 'Exercício', 'supino reto', 'Supino reto com barra');
  await expect(page.getByRole('list', { name: 'Sessões do exercício' })).toContainText(
    'e1RM 80 kg',
  );
  await expect(page.getByRole('list', { name: 'Volume por músculo' })).toContainText('Peitoral');
});

test('treino livre: adicionar, substituir por alternativa e registrar', async ({ page }) => {
  await page.getByRole('button', { name: 'Treino livre' }).click();
  await expect(page).toHaveURL(/\/treino\/sessao\//);

  await page.getByRole('button', { name: 'Adicionar exercício' }).click();
  await pickExercise(page, 'Adicionar exercício', 'supino reto', 'Supino reto com barra');
  await page.getByRole('button', { name: 'Substituir Supino reto com barra' }).click();
  await page
    .getByRole('list', { name: 'Alternativas' })
    .getByRole('button', { name: /^Supino reto com halteres/ })
    .click();

  const card = page.getByLabel('Supino reto com halteres', { exact: true });
  await expect(card).toContainText('substituído');
  await card.getByRole('textbox', { name: 'Carga', exact: true }).fill('24');
  await card.getByRole('textbox', { name: 'Repetições', exact: true }).fill('12');
  await card.getByRole('button', { name: 'Confirmar série 1' }).click();
  await expect(card.getByLabel('Série 1 concluída')).toContainText('24 kg × 12');

  await page.getByRole('button', { name: 'Finalizar treino' }).click();
  await page.getByRole('button', { name: 'Salvar treino' }).click();
  await expect(page.getByTestId('sync-status')).toHaveText('Tudo sincronizado', {
    timeout: 20_000,
  });
  await expect(page.getByTestId('summary-tonnage')).toHaveText('288 kg');
});
