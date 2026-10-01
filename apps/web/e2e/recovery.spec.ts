import { expect, test } from '@playwright/test';

import { completeOnboarding, signUp } from './helpers';

test('DoD Fase 5: futebol intenso ontem + noite ruim hoje → treino adaptado com explicação', async ({
  page,
}) => {
  await signUp(page);
  // Rotina padrão do onboarding: academia seg/qua/sex, 60 min; academia completa.
  await completeOnboarding(page);

  // Gera e ativa o programa por regras.
  await page.goto('/treino');
  await page.getByRole('button', { name: 'Gerar programa' }).click();
  const generator = page.getByRole('region', { name: 'Gerar programa' });
  await generator.getByRole('button', { name: 'Gerar', exact: true }).click();
  await expect(
    generator.getByRole('list', { name: 'Treinos gerados' }).getByRole('listitem'),
  ).toHaveCount(3);
  await generator.getByRole('button', { name: 'Ativar programa' }).click();

  // Garante um treino hoje: move o próximo agendado, se hoje não for dia de academia.
  const agenda = page.getByRole('list', { name: 'Treinos agendados' });
  await expect(agenda.getByRole('listitem').first()).toBeVisible();
  const move = agenda
    .getByRole('listitem')
    .first()
    .getByRole('button', { name: /para hoje$/ });
  if ((await move.count()) > 0) await move.click();

  // Futebol ontem, 90 min, RPE 8, alta exigência nas pernas.
  const activity = page.getByRole('region', { name: 'Registrar atividade' });
  await activity.getByLabel('Quando').selectOption('yesterday');
  await activity.getByLabel('Duração (min)').fill('90');
  await activity
    .getByRole('group', { name: 'Intensidade da atividade' })
    .getByRole('button', { name: '8', exact: true })
    .click();
  await activity.getByRole('button', { name: 'Salvar atividade' }).click();
  await expect(activity.getByRole('status')).toContainText('Futebol registrado');

  // Check-in de uma noite ruim.
  await page.goto('/hoje');
  const checkin = page.getByRole('region', { name: 'Check-in' });
  for (const [group, value] of [
    ['Qualidade do sono', '1'],
    ['Disposição', '2'],
    ['Estresse', '3'],
    ['Fadiga', '4'],
    ['Dor muscular', '3'],
  ] as const) {
    await checkin
      .getByRole('group', { name: group })
      .getByRole('button', { name: value, exact: true })
      .click();
  }
  await checkin.getByLabel('Horas de sono').fill('4');
  await checkin.getByRole('button', { name: 'Salvar check-in' }).click();
  // Prontidão geral: 9 + 5 + 5 + 7,5 + 7,5 = 34.
  await expect(page.getByTestId('readiness-score')).toHaveText('34');

  // Treino do dia adaptado, com explicação coerente.
  const workout = page.getByRole('region', { name: 'Treino do dia' });
  const changes = workout.getByRole('list', { name: 'Ajustes de hoje' });
  await expect(changes).toContainText('Sua prontidão hoje está em 24');
  await expect(changes).toContainText('sessão leve, com metade das séries');
  await expect(changes).toContainText('porque você jogou futebol ontem com intensidade 8');
  await expect(workout.getByRole('button', { name: 'Sessão leve' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(workout.getByRole('list', { name: 'Exercícios de hoje' })).toContainText('(era');

  await workout.getByRole('button', { name: 'Começar' }).click();
  await expect(page).toHaveURL(/\/treino\/sessao\//);
  await expect(page.getByTestId('adaptation-note')).toContainText('jogou futebol ontem');
});
