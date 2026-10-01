import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDate } from '@atlas/core';

import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_TZ, seedDemo } from '../src/demo/seed';

import { as, createTestApp, sessionCookie, type TestContext } from './helpers';

interface Insight {
  type: string;
  body: string;
  data: Record<string, unknown>;
}

describe('demo seed (P10.4, DoD da Fase 6)', () => {
  let ctx: TestContext;
  let call: ReturnType<typeof as>;
  let seeded: Awaited<ReturnType<typeof seedDemo>>;
  const today = localDate(new Date(), DEMO_TZ);

  beforeAll(async () => {
    ctx = await createTestApp();
    // Duas vezes: o seed recria o usuário demo sem duplicar.
    await seedDemo(ctx.handle.db, { today });
    seeded = await seedDemo(ctx.handle.db, { today });
    const login = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    call = as(ctx.app, sessionCookie(login));
  }, 120_000);
  afterAll(() => ctx.close());

  it('produces the planned insights', async () => {
    const items = (await call({ method: 'GET', url: '/api/v1/insights' })).json<{
      items: Insight[];
    }>().items;
    const types = new Set(items.map((i) => i.type));
    for (const t of ['LOW_PROTEIN_STREAK', 'EXERCISE_STAGNANT', 'NEW_PR', 'SLEEP_PERFORMANCE_LINK'])
      expect(types).toContain(t);
    // Nada de alarme falso: peso no ritmo, pesagens em dia, carga estável.
    for (const t of [
      'WEIGHT_LOSS_TOO_FAST',
      'WEIGHT_TREND_OFF_GOAL',
      'MISSED_WEIGH_INS',
      'HIGH_ACWR',
    ])
      expect(types).not.toContain(t);

    // O exercício congelado pelo seed aparece como estagnado.
    const frozenId = seeded.stagnantExerciseId;
    expect(frozenId).not.toBeNull();
    expect(
      items.some((i) => i.type === 'EXERCISE_STAGNANT' && i.data.exerciseId === frozenId),
    ).toBe(true);
    const sleep = items.find((i) => i.type === 'SLEEP_PERFORMANCE_LINK');
    expect(sleep?.body).toContain('noites com menos de 6 h');
    expect(Math.abs(Number(sleep?.data.r))).toBeGreaterThanOrEqual(0.4);
  });

  it('progress summary has coherent numbers', async () => {
    const from = addDays(today, -83);
    const res = await call({
      method: 'GET',
      url: `/api/v1/analytics/summary?from=${from}&to=${today}`,
    });
    expect(res.statusCode).toBe(200);
    const s = res.json<{
      summary: {
        training: { sessions: number; adherencePct: number; tonnage: number };
        nutrition: { completeDays: number; avgKcal: number; avgProteinG: number };
        body: { changeKg: number; ratePctPerWeek: number; weighIns: number };
        recovery: { avgSleepHours: number; avgReadiness: number };
      };
      strength: { name: string; changePct: number; stagnant: boolean }[];
      volume: unknown[];
    }>();
    const { training, nutrition, body, recovery } = s.summary;
    // 4 treinos por semana, menos a pausa e ~8% de faltas.
    expect(training.sessions).toBeGreaterThanOrEqual(35);
    expect(training.adherencePct).toBeGreaterThan(70);
    expect(training.adherencePct).toBeLessThan(100);
    expect(nutrition.completeDays).toBeGreaterThanOrEqual(60);
    expect(nutrition.avgKcal).toBeGreaterThan(1900);
    expect(nutrition.avgKcal).toBeLessThan(2400);
    // Tendência caindo perto de 0,5% por semana.
    expect(body.changeKg).toBeLessThan(-3);
    expect(body.ratePctPerWeek).toBeGreaterThan(-0.8);
    expect(body.ratePctPerWeek).toBeLessThan(-0.3);
    expect(recovery.avgReadiness).toBeGreaterThan(50);
    expect(s.strength.length).toBeGreaterThan(5);
    expect(s.strength.filter((e) => !e.stagnant).every((e) => e.changePct > 0)).toBe(true);
    expect(s.volume.length).toBeGreaterThan(5);
  });

  it('adaptive TDEE in use with high confidence', async () => {
    const e = (await call({ method: 'GET', url: '/api/v1/nutrition/energy-estimates' })).json<{
      current: { confidence: string; tdeeUsed: number; tdeeFormula: number } | null;
      items: unknown[];
    }>();
    expect(e.items).toHaveLength(5);
    expect(e.current?.confidence).toBe('high');
    // Ingestão ~2150 kcal com perda de ~0,4 kg/semana: GET observado perto da fórmula.
    expect(Math.abs((e.current?.tdeeUsed ?? 0) - (e.current?.tdeeFormula ?? 0))).toBeLessThan(300);
    const t = await call({
      method: 'GET',
      url: `/api/v1/nutrition/targets?from=${today}&to=${today}`,
    });
    expect(t.json<{ days: { method: string }[] }>().days[0]?.method).toBe('adaptive');
  });
});
