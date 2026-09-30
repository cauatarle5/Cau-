import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDate } from '@atlas/core';
import { and, eq, nutritionTargets, users } from '@atlas/db';

import {
  as,
  createTestApp,
  onboardedUser,
  PROFILE_MALE,
  registerUser,
  type TestContext,
} from './helpers';

const today = localDate(new Date(), 'America/Sao_Paulo');
/** Faz 30 anos em 1º de janeiro deste ano: idade 30 o ano todo. */
const birthDate30 = `${Number(today.slice(0, 4)) - 30}-01-01`;

describe('GET /nutrition/targets', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  it('matches the hand-checked case (core test "fat loss, male, gym 4×60 + football")', async () => {
    const { cookie } = await registerUser(ctx.app);
    const call = as(ctx.app, cookie);
    await call({
      method: 'PUT',
      url: '/api/v1/profile',
      payload: { ...PROFILE_MALE, birthDate: birthDate30 },
    });
    await call({
      method: 'PUT',
      url: '/api/v1/availability',
      payload: { items: [1, 2, 4, 5].map((weekday) => ({ weekday, maxMinutes: 60, kind: 'gym' })) },
    });
    await call({
      method: 'PUT',
      url: '/api/v1/sports',
      payload: {
        items: [
          {
            sportCode: 'football',
            weeklyFrequency: 1,
            typicalDurationMin: 90,
            typicalIntensity: 4,
          },
        ],
      },
    });
    await call({
      method: 'POST',
      url: '/api/v1/body-measurements',
      payload: { date: today, weightKg: 80 },
    });
    await call({ method: 'POST', url: '/api/v1/goals', payload: { primaryGoal: 'fat_loss' } });

    // Semana seguinte inteira (seg–dom), para não depender do dia de hoje.
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    const nextMonday = addDays(today, 7 - ((dow + 6) % 7));
    const res = await call({
      method: 'GET',
      url: `/api/v1/nutrition/targets?from=${nextMonday}&to=${addDays(nextMonday, 6)}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      blocked: null;
      targets: Record<string, number>;
      breakdown: {
        ageYears: number;
        bmr: { kcal: number; method: string };
        locksApplied: string[];
        weightKg: number;
      };
      days: {
        dayType: string;
        dayTypeOverridden: boolean;
        method: string;
        kcal: number;
        proteinG: number;
      }[];
    }>();
    expect(body.blocked).toBeNull();
    // Base semanal = caso conferido à mão no core.
    expect(body.targets).toEqual({
      kcal: 2351,
      proteinG: 176,
      fatG: 64,
      carbsG: 268,
      fiberG: 33,
      waterMl: 3200,
    });
    expect(body.breakdown).toMatchObject({
      ageYears: 30,
      weightKg: 80,
      bmr: { kcal: 1780, method: 'mifflin_st_jeor' },
      locksApplied: [],
    });
    // P5.8: academia seg/ter/qui/sex → training; demais → rest (futebol sem dia fixo).
    // Brutos: 4 × 2351 + 3 × 2115,9 = 15751,7; alvo 7 × 2351 = 16457 → +100,8/dia.
    expect(body.days.map((d) => [d.dayType, d.kcal])).toEqual([
      ['training', 2452],
      ['training', 2452],
      ['rest', 2217],
      ['training', 2452],
      ['training', 2452],
      ['rest', 2217],
      ['rest', 2217],
    ]);
    const avg = body.days.reduce((a, d) => a + d.kcal, 0) / 7;
    expect(Math.abs(avg - 2351)).toBeLessThan(1);
    expect(new Set(body.days.map((d) => d.proteinG))).toEqual(new Set([176]));
    expect(body.days[0]).toMatchObject({ method: 'formula', dayTypeOverridden: false });
  });

  it('is blocked until onboarding is complete', async () => {
    const { cookie } = await registerUser(ctx.app);
    const res = await as(
      ctx.app,
      cookie,
    )({ method: 'GET', url: `/api/v1/nutrition/targets?from=${today}&to=${today}` });
    expect(res.json()).toEqual({
      blocked: 'ONBOARDING_INCOMPLETE',
      targets: null,
      breakdown: null,
      days: [],
    });
  });

  it('never generates numbers with a clinical condition (P5.7, ADR-017)', async () => {
    const u = await onboardedUser(ctx.app, today);
    await u.call({
      method: 'PUT',
      url: '/api/v1/profile',
      payload: { ...PROFILE_MALE, clinicalCondition: true },
    });
    const res = await u.call({
      method: 'GET',
      url: `/api/v1/nutrition/targets?from=${today}&to=${today}`,
    });
    expect(res.json()).toEqual({
      blocked: 'CLINICAL_CONDITION',
      targets: null,
      breakdown: null,
      days: [],
    });
  });

  it('uses Katch-McArdle with a recent measured body fat', async () => {
    const u = await onboardedUser(ctx.app, today);
    await u.call({
      method: 'POST',
      url: '/api/v1/body-measurements',
      payload: { date: today, bodyFatPct: 20, bodyFatMethod: 'dexa' },
    });
    const body = (
      await u.call({ method: 'GET', url: `/api/v1/nutrition/targets?from=${today}&to=${today}` })
    ).json<{
      breakdown: { bmr: { method: string; kcal: number }; bodyFatPct: number };
    }>();
    // 370 + 21,6 × 64 = 1752,4
    expect(body.breakdown.bmr.method).toBe('katch_mcardle');
    expect(body.breakdown.bmr.kcal).toBeCloseTo(1752.4, 6);
    expect(body.breakdown.bodyFatPct).toBe(20);
  });

  it('validates the range', async () => {
    const u = await onboardedUser(ctx.app, today);
    expect(
      (await u.call({ method: 'GET', url: `/api/v1/nutrition/targets?from=${today}` })).statusCode,
    ).toBe(400);
    expect(
      (
        await u.call({
          method: 'GET',
          url: `/api/v1/nutrition/targets?from=${today}&to=${addDays(today, 200)}`,
        })
      ).statusCode,
    ).toBe(400);
  });

  it("isolates users: B's targets never use A's data", async () => {
    await onboardedUser(ctx.app, today);
    const b = await registerUser(ctx.app);
    const res = await as(
      ctx.app,
      b.cookie,
    )({ method: 'GET', url: `/api/v1/nutrition/targets?from=${today}&to=${today}` });
    expect(res.json()).toMatchObject({ blocked: 'ONBOARDING_INCOMPLETE' });
  });
});

describe('day type override (P5.8, ADR-026)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  it('overrides future days, keeps the override, and rejects past days', async () => {
    const u = await onboardedUser(ctx.app, today);
    const tomorrow = addDays(today, 1);
    const res = await u.call({
      method: 'PUT',
      url: `/api/v1/nutrition/targets/${tomorrow}/day-type`,
      payload: { dayType: 'hard_training' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      days: [{ date: tomorrow, dayType: 'hard_training', dayTypeOverridden: true }],
    });

    const again = await u.call({
      method: 'GET',
      url: `/api/v1/nutrition/targets?from=${tomorrow}&to=${tomorrow}`,
    });
    expect(again.json()).toMatchObject({
      days: [{ dayType: 'hard_training', dayTypeOverridden: true }],
    });

    const past = await u.call({
      method: 'PUT',
      url: `/api/v1/nutrition/targets/${addDays(today, -1)}/day-type`,
      payload: { dayType: 'rest' },
    });
    expect(past.statusCode).toBe(400);
    const bad = await u.call({
      method: 'PUT',
      url: `/api/v1/nutrition/targets/${tomorrow}/day-type`,
      payload: { dayType: 'x' },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('never recalculates past days: a stored snapshot wins; past days without one are not persisted', async () => {
    const u = await onboardedUser(ctx.app, today);
    const yesterday = addDays(today, -1);
    const [row] = await ctx.handle.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, u.payload.email));
    // Snapshot "de ontem" gravado quando ontem era hoje.
    await ctx.handle.db.insert(nutritionTargets).values({
      userId: row?.id ?? '',
      date: yesterday,
      dayType: 'rest',
      kcal: 1999,
      proteinG: 150,
      carbsG: 200,
      fatG: 60,
      fiberG: 28,
      waterMl: 2800,
      method: 'formula',
      inputs: {},
    });
    await u.call({ method: 'POST', url: '/api/v1/goals', payload: { primaryGoal: 'muscle_gain' } });
    const after = (
      await u.call({
        method: 'GET',
        url: `/api/v1/nutrition/targets?from=${yesterday}&to=${yesterday}`,
      })
    ).json<{ days: { kcal: number; dayType: string }[] }>();
    expect(after.days[0]).toMatchObject({ kcal: 1999, dayType: 'rest' });

    const older = addDays(today, -10);
    await u.call({ method: 'GET', url: `/api/v1/nutrition/targets?from=${older}&to=${older}` });
    const stored = await ctx.handle.db
      .select()
      .from(nutritionTargets)
      .where(and(eq(nutritionTargets.userId, row?.id ?? ''), eq(nutritionTargets.date, older)));
    expect(stored).toHaveLength(0);
  });

  it('resets an override back to the automatic day type', async () => {
    const u = await onboardedUser(ctx.app, today);
    const tomorrow = addDays(today, 1);
    const url = `/api/v1/nutrition/targets/${tomorrow}/day-type`;
    const auto = (
      await u.call({
        method: 'GET',
        url: `/api/v1/nutrition/targets?from=${tomorrow}&to=${tomorrow}`,
      })
    ).json<{
      days: { dayType: string }[];
    }>().days[0]?.dayType;
    await u.call({ method: 'PUT', url, payload: { dayType: 'sport' } });
    const reset = await u.call({ method: 'PUT', url, payload: { dayType: null } });
    expect(reset.json()).toMatchObject({ days: [{ dayType: auto, dayTypeOverridden: false }] });
  });
});
