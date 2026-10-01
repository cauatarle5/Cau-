import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDate, weekStart } from '@atlas/core';
import {
  activities,
  bodyMeasurements,
  dailyCheckins,
  energyEstimates,
  mealItems,
  meals,
  plannedWorkouts,
} from '@atlas/db';

import { runTick } from '../src/jobs/worker';
import { createServices } from '../src/services';

import { as, createTestApp, onboardedUser, registerUser, type TestContext } from './helpers';

const TZ = 'America/Sao_Paulo';
const today = localDate(new Date(), TZ);
const MISSING = '00000000-0000-7000-8000-000000000000';

interface DayTargets {
  date: string;
  dayType: string;
  kcal: number;
  proteinG: number;
  method: string;
}
interface Targets {
  days: DayTargets[];
  breakdown: { tdee: { kcal: number }; adaptive: { kcal: number; confidence: string } | null };
}
interface Insight {
  id: string;
  type: string;
  severity: string;
  status: string;
  body: string;
  data: Record<string, unknown>;
}

describe('phase 6: day type, adaptive TDEE, insights, context and analytics', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  /** Refeições registradas no dia, cada uma com kcal/proteína dadas. */
  async function logMeals(
    userId: string,
    date: string,
    items: { kcal: number; proteinG: number; carbsG?: number }[],
  ) {
    const db = ctx.handle.db;
    for (const it of items) {
      const [meal] = await db
        .insert(meals)
        .values({ userId, date, slot: 'other', status: 'logged' })
        .returning();
      if (!meal) throw new Error('meal not inserted');
      await db.insert(mealItems).values({
        mealId: meal.id,
        foodName: 'Teste',
        quantity: 100,
        unitCode: 'g',
        grams: 100,
        nutrientsSnapshot: {
          kcal: it.kcal,
          proteinG: it.proteinG,
          carbsG: it.carbsG ?? 50,
          fatG: 20,
          fiberG: 5,
        },
      });
    }
  }

  const targetsFor = async (call: ReturnType<typeof as>, date: string) =>
    (
      await call({ method: 'GET', url: `/api/v1/nutrition/targets?from=${date}&to=${date}` })
    ).json<Targets>();

  it('day type follows the real plan (ADR-048): registered sport and hard session', async () => {
    const a = await onboardedUser(ctx.app, today);
    const before = await targetsFor(a.call, today);
    expect(before.days[0]?.dayType).toBe('rest');
    const act = await a.call({
      method: 'POST',
      url: '/api/v1/activities',
      payload: {
        date: today,
        sportCode: 'football',
        durationMin: 90,
        intensityRpe: 8,
        lowerBodyDemand: 3,
      },
    });
    expect(act.statusCode).toBe(201);
    const after = await targetsFor(a.call, today);
    expect(after.days[0]?.dayType).toBe('sport');
    // Futebol registrado no próprio dia aumenta a meta de hoje.
    expect(after.days[0]?.kcal).toBeGreaterThan(before.days[0]?.kcal ?? Infinity);

    const b = await onboardedUser(ctx.app, today);
    const s = await b.call({ method: 'POST', url: '/api/v1/sessions', payload: { name: 'Livre' } });
    expect(s.statusCode).toBe(201);
    const id = s.json<{ id: string }>().id;
    expect((await targetsFor(b.call, today)).days[0]?.dayType).toBe('training');
    await b.call({
      method: 'PATCH',
      url: `/api/v1/sessions/${id}`,
      payload: { finish: true, sessionRpe: 9, durationMin: 70 },
    });
    expect((await targetsFor(b.call, today)).days[0]?.dayType).toBe('hard_training');
  });

  it('adaptive TDEE: high confidence, ±150 cap, used by the targets (P5.3)', async () => {
    const u = await onboardedUser(ctx.app, today);
    const db = ctx.handle.db;
    // 21 dias completos de 2200 kcal e 18 pesagens estáveis em 80 kg nos 28 dias anteriores.
    for (let i = 1; i <= 21; i++) {
      await logMeals(u.user.id, addDays(today, -i), [
        { kcal: 700, proteinG: 50 },
        { kcal: 800, proteinG: 60 },
        { kcal: 700, proteinG: 50 },
      ]);
    }
    for (let i = 1; i <= 18; i++) {
      await db.insert(bodyMeasurements).values({
        userId: u.user.id,
        date: addDays(today, -i),
        weightKg: 80,
      });
    }
    const empty = await u.call({ method: 'GET', url: '/api/v1/nutrition/energy-estimates' });
    expect(empty.json()).toEqual({ current: null, items: [] });
    const res = await u.call({ method: 'POST', url: '/api/v1/nutrition/energy-estimates/refresh' });
    expect(res.statusCode).toBe(200);
    const e = res.json<{
      confidence: string;
      tdeeObserved: number;
      tdeeFormula: number;
      tdeeUsed: number;
      loggedDays: number;
      weighInCount: number;
      intakeAvgKcal: number;
      weightTrendKg: number;
    }>();
    expect(e).toMatchObject({
      confidence: 'high',
      loggedDays: 21,
      weighInCount: 18,
      intakeAvgKcal: 2200,
      weightTrendKg: 0,
      // Peso estável: GET observado = ingestão média.
      tdeeObserved: 2200,
    });
    // 0,85 × 2200 + 0,15 × fórmula fica mais de 150 abaixo da fórmula → limitado.
    expect(Math.abs(e.tdeeUsed - (e.tdeeFormula - 150))).toBeLessThanOrEqual(1);
    // Repetir na mesma semana é idempotente.
    await u.call({ method: 'POST', url: '/api/v1/nutrition/energy-estimates/refresh' });
    const list = (await u.call({ method: 'GET', url: '/api/v1/nutrition/energy-estimates' })).json<{
      current: { tdeeUsed: number; weekStart: string } | null;
      items: unknown[];
    }>();
    expect(list.items).toHaveLength(1);
    expect(list.current?.weekStart).toBe(weekStart(today));

    const t = await targetsFor(u.call, today);
    expect(t.days[0]?.method).toBe('adaptive');
    expect(t.breakdown.adaptive).toEqual({
      kcal: e.tdeeUsed,
      confidence: 'high',
      formulaKcal: expect.any(Number) as number,
    });
    expect(t.breakdown.tdee.kcal).toBe(e.tdeeUsed);
  });

  it('insights: low protein streak, dedup, dismiss, isolation; daily context', async () => {
    const a = await onboardedUser(ctx.app, today);
    const b = await registerUser(ctx.app);
    const callB = as(ctx.app, b.cookie);
    const db = ctx.handle.db;
    const proteins = [60, 200, 60, 60, 200]; // ontem, anteontem, ...
    for (let i = 1; i <= 5; i++) {
      await db.insert(activities).values({
        userId: a.user.id,
        date: addDays(today, -i),
        sportCode: 'running',
        durationMin: 40,
        intensityRpe: 6,
        lowerBodyDemand: 2,
      });
      await logMeals(a.user.id, addDays(today, -i), [
        { kcal: 600, proteinG: (proteins[i - 1] ?? 0) / 3 },
        { kcal: 700, proteinG: (proteins[i - 1] ?? 0) / 3 },
        { kcal: 700, proteinG: (proteins[i - 1] ?? 0) / 3 },
      ]);
    }
    const refresh = await a.call({ method: 'POST', url: '/api/v1/insights/refresh' });
    expect(refresh.statusCode).toBe(200);
    const list = async (q = '') =>
      (await a.call({ method: 'GET', url: `/api/v1/insights${q}` })).json<{ items: Insight[] }>()
        .items;
    const first = await list();
    const protein = first.find((i) => i.type === 'LOW_PROTEIN_STREAK');
    expect(protein).toMatchObject({ severity: 'attention', status: 'new' });
    expect(protein?.body).toContain('Em 3 dos últimos 5 dias de treino');
    // Pesagem de hoje: sem alerta de pesagens.
    expect(first.some((i) => i.type === 'MISSED_WEIGH_INS')).toBe(false);
    // Mais severo primeiro.
    expect(first[0]?.type).toBe('LOW_PROTEIN_STREAK');

    // Contexto do dia: insight do topo, esporte ontem, sono ruim, corpo e nutrição.
    await a.call({
      method: 'PUT',
      url: `/api/v1/checkins/${today}`,
      payload: { sleepHours: 5, sleepQuality: 2, energy: 3, stress: 3, fatigue: 3, soreness: 2 },
    });
    await logMeals(a.user.id, today, [{ kcal: 500, proteinG: 20 }]);
    const dc = await a.call({ method: 'GET', url: `/api/v1/daily-context/${today}` });
    expect(dc.statusCode).toBe(200);
    const c = dc.json<{
      dayType: string;
      flags: string[];
      topInsight: Insight | null;
      body: { weightTrendKg: number; lastWeighInDaysAgo: number };
      nutrition: { loggedMeals: number; completeness: number; consumed: { kcal: number } };
      readiness: { band: string };
      load: { dayAU: number; acwr: number | null };
      training: { planned: unknown; done: unknown };
    }>();
    expect(c.topInsight?.type).toBe('LOW_PROTEIN_STREAK');
    expect(c.flags).toEqual(['LOW_PROTEIN_TODAY', 'SPORT_YESTERDAY', 'POOR_SLEEP']);
    expect(c.body).toEqual({ weightTrendKg: 80, lastWeighInDaysAgo: 0 });
    expect(c.nutrition).toMatchObject({ loggedMeals: 1, consumed: { kcal: 500 } });
    expect(c.nutrition.completeness).toBeCloseTo(1 / 3, 5);
    expect(c.dayType).toBe('rest');
    expect(c.load).toMatchObject({ dayAU: 0, acwr: null, acute7d: 1200 });
    expect(c.training).toEqual({ planned: null, adapted: null, done: null });

    // Refresh repetido não duplica.
    await a.call({ method: 'POST', url: '/api/v1/insights/refresh' });
    expect((await list()).filter((i) => i.type === 'LOW_PROTEIN_STREAK')).toHaveLength(1);

    const id = protein?.id ?? MISSING;
    for (const r of await Promise.all([
      callB({ method: 'PATCH', url: `/api/v1/insights/${id}`, payload: { status: 'dismissed' } }),
      a.call({ method: 'PATCH', url: `/api/v1/insights/${MISSING}`, payload: { status: 'seen' } }),
    ])) {
      expect(r.statusCode).toBe(404);
    }
    expect(
      (await a.call({ method: 'PATCH', url: `/api/v1/insights/${id}`, payload: { status: 'x' } }))
        .statusCode,
    ).toBe(400);
    expect((await callB({ method: 'GET', url: '/api/v1/insights' })).json()).toEqual({ items: [] });

    const dismissed = await a.call({
      method: 'PATCH',
      url: `/api/v1/insights/${id}`,
      payload: { status: 'dismissed' },
    });
    expect(dismissed.json<Insight>().status).toBe('dismissed');
    expect((await list()).some((i) => i.id === id)).toBe(false);
    // Dispensado não volta antes de expirar.
    await a.call({ method: 'POST', url: '/api/v1/insights/refresh' });
    expect((await list()).some((i) => i.id === id)).toBe(false);
    expect((await list('?status=dismissed')).map((i) => i.id)).toEqual([id]);
    const after = (await a.call({ method: 'GET', url: `/api/v1/daily-context/${today}` })).json<{
      topInsight: Insight | null;
    }>();
    expect(after.topInsight?.type).not.toBe('LOW_PROTEIN_STREAK');
    // Outro dia: sem insight do topo (é o de agora).
    const past = (
      await a.call({ method: 'GET', url: `/api/v1/daily-context/${addDays(today, -1)}` })
    ).json<{ topInsight: Insight | null }>();
    expect(past.topInsight).toBeNull();
  });

  it('insights the rules no longer produce stop being active (ADR-053)', async () => {
    const a = await onboardedUser(ctx.app, today);
    const db = ctx.handle.db;
    for (let i = 1; i <= 5; i++) {
      await db.insert(activities).values({
        userId: a.user.id,
        date: addDays(today, -i),
        sportCode: 'running',
        durationMin: 40,
        intensityRpe: 6,
        lowerBodyDemand: 2,
      });
      await logMeals(a.user.id, addDays(today, -i), [
        { kcal: 600, proteinG: 20 },
        { kcal: 700, proteinG: 20 },
        { kcal: 700, proteinG: 20 },
      ]);
    }
    const types = async () =>
      (await a.call({ method: 'GET', url: '/api/v1/insights' }))
        .json<{ items: Insight[] }>()
        .items.map((i) => i.type);
    await a.call({ method: 'POST', url: '/api/v1/insights/refresh' });
    expect(await types()).toContain('LOW_PROTEIN_STREAK');
    // Completa a proteína em 3 dos 5 dias: a sequência deixa de existir.
    for (const i of [1, 2, 3])
      await logMeals(a.user.id, addDays(today, -i), [{ kcal: 600, proteinG: 150 }]);
    await a.call({ method: 'POST', url: '/api/v1/insights/refresh' });
    expect(await types()).not.toContain('LOW_PROTEIN_STREAK');
  });

  it('real plan: started elsewhere or missed workouts are not training days (ADR-053)', async () => {
    const u = await onboardedUser(ctx.app, today);
    await u.call({
      method: 'PUT',
      url: '/api/v1/availability',
      payload: {
        items: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, maxMinutes: 60, kind: 'gym' })),
      },
    });
    const draft = (
      await u.call({ method: 'POST', url: '/api/v1/programs/generate', payload: {} })
    ).json<{ program: Record<string, unknown> }>();
    const prog = await u.call({
      method: 'POST',
      url: '/api/v1/programs',
      payload: { ...draft.program, activate: true },
    });
    expect(prog.statusCode).toBe(201);
    const programId = prog.json<{ id: string }>().id;
    const planned = (
      await u.call({
        method: 'GET',
        url: `/api/v1/planned-workouts?from=${today}&to=${addDays(today, 6)}`,
      })
    ).json<{ items: { id: string; date: string }[] }>().items;
    const future = planned.find((p) => p.date > today);
    expect(future).toBeDefined();
    if (!future) return;
    expect((await targetsFor(u.call, future.date)).days[0]?.dayType).toBe('training');
    // Treino de outro dia iniciado hoje: conta só hoje, no dia da sessão.
    const s = await u.call({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { plannedWorkoutId: future.id },
    });
    expect(s.statusCode).toBe(201);
    expect((await targetsFor(u.call, today)).days[0]?.dayType).toBe('training');
    expect((await targetsFor(u.call, future.date)).days[0]?.dayType).toBe('rest');

    // Agendado ontem e não feito: não é dia de treino.
    await ctx.handle.db.insert(plannedWorkouts).values({
      userId: u.user.id,
      date: addDays(today, -1),
      programId,
      templateName: 'Perdido',
      weekIndex: 0,
    });
    expect((await targetsFor(u.call, addDays(today, -1))).days[0]?.dayType).toBe('rest');
  });

  it('stale or newer low-confidence estimates fall back to the formula (ADR-053)', async () => {
    const u = await onboardedUser(ctx.app, today);
    const db = ctx.handle.db;
    const ws = weekStart(today);
    const row = (weekStartDate: string, confidence: 'low' | 'medium' | 'high') => ({
      userId: u.user.id,
      weekStart: weekStartDate,
      tdeeFormula: 2600,
      tdeeObserved: 2400,
      tdeeUsed: 2450,
      confidence,
      loggedDays: 20,
      weighInCount: 15,
      inputs: {},
    });
    const method = async () => (await targetsFor(u.call, today)).days[0]?.method;
    await db.insert(energyEstimates).values(row(addDays(ws, -28), 'high'));
    expect(await method()).toBe('formula');
    await db.insert(energyEstimates).values(row(addDays(ws, -7), 'medium'));
    expect(await method()).toBe('adaptive');
    await db.insert(energyEstimates).values(row(ws, 'low'));
    expect(await method()).toBe('formula');
    const list = (await u.call({ method: 'GET', url: '/api/v1/nutrition/energy-estimates' })).json<{
      current: unknown;
      items: unknown[];
    }>();
    expect(list.current).toBeNull();
    expect(list.items).toHaveLength(3);
  });

  it('analytics summary and compare', async () => {
    const u = await onboardedUser(ctx.app, today);
    const db = ctx.handle.db;
    for (let i = 1; i <= 6; i++) {
      await logMeals(u.user.id, addDays(today, -i), [
        { kcal: 700, proteinG: 60 },
        { kcal: 700, proteinG: 60 },
        { kcal: 600, proteinG: 60 },
      ]);
      await db.insert(dailyCheckins).values({
        userId: u.user.id,
        date: addDays(today, -i),
        sleepHours: 7,
        sleepQuality: 4,
        energy: 4,
        stress: 2,
        fatigue: 2,
        soreness: 2,
        readinessScore: 80,
      });
    }
    const from = addDays(today, -13);
    const res = await u.call({
      method: 'GET',
      url: `/api/v1/analytics/summary?from=${from}&to=${today}`,
    });
    expect(res.statusCode).toBe(200);
    const s = res.json<{
      summary: {
        days: number;
        nutrition: { completeDays: number; avgKcal: number; avgProteinG: number };
        recovery: { avgSleepHours: number; avgReadiness: number; checkins: number };
        body: { weighIns: number; endTrendKg: number };
        training: { sessions: number; adherencePct: number | null };
      };
      days: { date: string; completeDay: boolean; kcal: number }[];
      goal: { primaryGoal: string } | null;
    }>();
    expect(s.summary.days).toBe(14);
    expect(s.summary.nutrition).toMatchObject({ completeDays: 6, avgKcal: 2000, avgProteinG: 180 });
    expect(s.summary.recovery).toMatchObject({ avgSleepHours: 7, avgReadiness: 80, checkins: 6 });
    expect(s.summary.body).toMatchObject({ weighIns: 1, endTrendKg: 80 });
    expect(s.summary.training).toMatchObject({ sessions: 0, adherencePct: null });
    expect(s.days).toHaveLength(14);
    expect(s.days.filter((d) => d.completeDay)).toHaveLength(6);
    expect(s.goal?.primaryGoal).toBe('fat_loss');

    const cmp = await u.call({
      method: 'GET',
      url: `/api/v1/analytics/compare?aFrom=${addDays(today, -27)}&aTo=${addDays(today, -14)}&bFrom=${from}&bTo=${today}`,
    });
    expect(cmp.statusCode).toBe(200);
    const deltas = cmp.json<{
      deltas: { metric: string; a: number | null; b: number | null; delta: number | null }[];
    }>().deltas;
    expect(deltas.find((d) => d.metric === 'nutrition.completeDays')).toEqual({
      metric: 'nutrition.completeDays',
      a: 0,
      b: 6,
      delta: 6,
      deltaPct: null,
    });

    for (const url of [
      `/api/v1/analytics/summary?from=${today}&to=${from}`,
      `/api/v1/analytics/summary?from=${addDays(today, -500)}&to=${today}`,
      `/api/v1/analytics/compare?aFrom=${today}&aTo=${from}&bFrom=${from}&bTo=${today}`,
    ]) {
      expect((await u.call({ method: 'GET', url })).statusCode).toBe(400);
    }
    // Sem perfil: resumo vazio, sem erro.
    const empty = await registerUser(ctx.app);
    const e = await as(
      ctx.app,
      empty.cookie,
    )({
      method: 'GET',
      url: `/api/v1/analytics/summary?from=${from}&to=${today}`,
    });
    expect(e.statusCode).toBe(200);
  });

  it('hourly job runs each user at local time (ADR-049)', async () => {
    const u = await onboardedUser(ctx.app, today);
    const svc = createServices(ctx.handle.db);
    const noop = () => undefined;
    const log = { error: noop, info: noop, warn: noop } as unknown as Parameters<
      typeof runTick
    >[0]['log'];
    const deps = { repo: svc.insightsRepo, energy: svc.energy, insights: svc.insights, log };
    // Próxima segunda 04:00 em São Paulo = 07:00 UTC: GET adaptativo, sem insights.
    const monday = addDays(weekStart(today), 7);
    const monday4 = await runTick(deps, new Date(`${monday}T07:00:00Z`));
    expect(monday4.energy).toBeGreaterThan(0);
    expect(monday4.insights).toBe(0);
    const est = await u.call({ method: 'GET', url: '/api/v1/nutrition/energy-estimates' });
    expect(est.json<{ items: { weekStart: string; confidence: string }[] }>().items).toEqual([
      expect.objectContaining({ weekStart: monday, confidence: 'low' }),
    ]);
    // 05:00 local: insights.
    const five = await runTick(deps, new Date(`${addDays(today, 1)}T08:00:00Z`));
    expect(five.insights).toBeGreaterThan(0);
    // Recuperação: a semana corrente ainda não tinha estimativa e foi calculada às 05:00.
    const after = (
      await u.call({ method: 'GET', url: '/api/v1/nutrition/energy-estimates' })
    ).json<{ items: { weekStart: string }[] }>().items;
    expect(after.map((i) => i.weekStart)).toContain(weekStart(addDays(today, 1)));
    // Rodar de novo na mesma hora não recalcula (já existe estimativa da semana).
    const again = await runTick(deps, new Date(`${addDays(today, 1)}T08:00:00Z`));
    expect(again.energy).toBe(0);
  });
});
