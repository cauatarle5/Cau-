import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDate } from '@atlas/core';

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

    const res = await call({
      method: 'GET',
      url: `/api/v1/nutrition/targets?from=${today}&to=${addDays(today, 2)}`,
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
      days: { date: string; dayType: null; method: string; kcal: number }[];
    }>();
    expect(body.blocked).toBeNull();
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
    expect(body.days).toHaveLength(3);
    expect(body.days[0]).toMatchObject({
      date: today,
      dayType: null,
      method: 'formula',
      kcal: 2351,
    });
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
