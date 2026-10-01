import { expect, test, type Page } from '@playwright/test';

import type { AnalyticsSummary, InsightList } from '@atlas/schemas';

// Usuário do seed demo (`pnpm db:seed:demo`, ADR-052).
const DEMO = { email: 'demo@atlas.app', password: 'demo-atlas-2026' };

const nf = (d: number) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: 0 });
const num = (v: number, d = 0) => nf(d).format(v);
const signed = (v: number, d = 0, unit = '') =>
  `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(v), d)}${unit}`;

/** Hoje no fuso do usuário demo. */
const todaySP = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function signInDemo(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(DEMO.email);
  await page.getByLabel('Senha').fill(DEMO.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/hoje');
}

test('DoD Fase 6: com o seed demo, Progresso e insights mostram números corretos', async ({
  page,
}) => {
  await signInDemo(page);

  // Hoje: sinais do dia e o insight mais severo ainda não visto.
  const insightCard = page.getByRole('region', { name: 'Insight do dia' });
  await expect(insightCard).toContainText('Proteína abaixo da meta nos dias de treino');

  // Os números exibidos são os calculados pela API (core) para as últimas 12 semanas.
  const today = todaySP();
  const from = addDays(today, -83);
  const res = await page.request.get(`/api/v1/analytics/summary?from=${from}&to=${today}`);
  expect(res.ok()).toBe(true);
  const s = (await res.json()) as AnalyticsSummary;
  const { body, training } = s.summary;
  expect(body.changeKg).not.toBeNull();
  expect(body.changeKg ?? 0).toBeLessThan(-3);

  await page.goto('/progresso');
  await expect(page.getByRole('button', { name: '12 semanas' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const corpo = page.getByRole('region', { name: 'Corpo' });
  await expect(corpo).toContainText(signed(body.changeKg ?? 0, 1, ' kg'));
  await expect(corpo).toContainText(`${num(body.endTrendKg ?? 0, 1)} kg`);
  await expect(corpo).toContainText(signed(body.ratePctPerWeek ?? 0, 2, '%'));

  const forca = page.getByRole('region', { name: 'Força' });
  const top = [...s.strength].sort((a, b) => b.changePct - a.changePct)[0];
  expect(top).toBeDefined();
  if (top) {
    await expect(forca.getByRole('list', { name: 'Ranking de evolução' })).toContainText(
      `${num(top.firstE1rm, 1)} → ${num(top.lastE1rm, 1)} kg`,
    );
  }
  await expect(forca).toContainText('Estagnados:');

  const volume = page.getByRole('region', { name: 'Volume' });
  await expect(volume.getByRole('img', { name: 'Mapa corporal do volume semanal' })).toBeVisible();
  const topMuscle = [...s.volume].sort((a, b) => b.hardSetsPerWeek - a.hardSetsPerWeek)[0];
  if (topMuscle) {
    await expect(volume.getByRole('list', { name: 'Séries por músculo' })).toContainText(
      topMuscle.namePt,
    );
  }

  const consistencia = page.getByRole('region', { name: 'Consistência' });
  await expect(consistencia).toContainText(`${num(training.adherencePct ?? 0)}%`);
  await expect(consistencia).toContainText(
    `${num(training.done)} de ${num(training.planned)} agendados`,
  );

  const comparacao = page.getByRole('region', { name: 'Comparação com o período anterior' });
  await expect(comparacao.getByRole('row', { name: /Treinos por semana/ })).toContainText(
    num(training.sessionsPerWeek, 1),
  );

  // Insights esperados do seed; dispensar um remove-o da lista.
  const insights = page.getByRole('region', { name: 'Insights', exact: true });
  for (const title of ['Proteína abaixo da meta nos dias de treino', 'Sono e desempenho'])
    await expect(insights.getByRole('article', { name: title })).toBeVisible();
  await expect(insights.getByRole('article', { name: /sem progresso$/ }).first()).toBeVisible();
  await expect(insights.getByRole('article', { name: /^Recorde em / }).first()).toBeVisible();
  const sleep = insights.getByRole('article', { name: 'Sono e desempenho' });
  await expect(sleep).toContainText('associação, não prova de causa');
  await sleep.getByRole('button', { name: 'Dispensar' }).click();
  await expect(insights.getByRole('article', { name: 'Sono e desempenho' })).toHaveCount(0);
  const list = (await (await page.request.get('/api/v1/insights')).json()) as InsightList;
  expect(list.items.some((i) => i.type === 'SLEEP_PERFORMANCE_LINK')).toBe(false);

  // Nutrição: estimativa baseada nos dados, com a confiança.
  await page.goto('/nutricao');
  await expect(page.getByText('Estimativa baseada nos seus dados · confiança alta')).toBeVisible();
});
