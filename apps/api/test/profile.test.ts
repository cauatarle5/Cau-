import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ageOn, localDate } from '@atlas/core';

import {
  as,
  createTestApp,
  onboardedUser,
  PROFILE_MALE,
  registerUser,
  type TestContext,
} from './helpers';

const today = localDate(new Date(), 'America/Sao_Paulo');
const MISSING = '00000000-0000-7000-8000-000000000000';

describe('profile module', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  it('requires authentication on every route', async () => {
    for (const url of [
      '/api/v1/profile',
      '/api/v1/availability',
      '/api/v1/equipment',
      '/api/v1/goals',
      '/api/v1/sports',
      '/api/v1/limitations',
    ]) {
      const res = await ctx.app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(401);
    }
  });

  describe('GET/PUT /profile', () => {
    it('starts empty, saves the profile and tracks onboarding completion (ADR-020)', async () => {
      const { cookie } = await registerUser(ctx.app);
      const call = as(ctx.app, cookie);

      expect((await call({ method: 'GET', url: '/api/v1/profile' })).json()).toEqual({
        profile: null,
        onboardingComplete: false,
      });

      const put = await call({ method: 'PUT', url: '/api/v1/profile', payload: PROFILE_MALE });
      expect(put.statusCode).toBe(200);
      expect(put.json()).toMatchObject({
        profile: { ...PROFILE_MALE, clinicalCondition: false, aestheticPriorities: [] },
        onboardingComplete: false,
      });

      await call({ method: 'POST', url: '/api/v1/goals', payload: { primaryGoal: 'maintenance' } });
      expect((await call({ method: 'GET', url: '/api/v1/profile' })).json()).toMatchObject({
        onboardingComplete: false,
      });
      await call({
        method: 'POST',
        url: '/api/v1/body-measurements',
        payload: { date: today, weightKg: 70 },
      });
      expect((await call({ method: 'GET', url: '/api/v1/profile' })).json()).toMatchObject({
        onboardingComplete: true,
      });

      // Upsert: segunda gravação atualiza.
      const again = await call({
        method: 'PUT',
        url: '/api/v1/profile',
        payload: { ...PROFILE_MALE, heightCm: 181 },
      });
      expect(again.json()).toMatchObject({ profile: { heightCm: 181 } });
    });

    it('validates ranges (P3.6)', async () => {
      const { cookie } = await registerUser(ctx.app);
      const res = await as(
        ctx.app,
        cookie,
      )({
        method: 'PUT',
        url: '/api/v1/profile',
        payload: { ...PROFILE_MALE, heightCm: 260, sex: 'x' },
      });
      expect(res.statusCode).toBe(400);
      const fields = res.json<{ errors: { field: string }[] }>().errors.map((e) => e.field);
      expect(fields).toEqual(expect.arrayContaining(['heightCm', 'sex']));
    });
  });

  describe('availability, equipment and sports (replace semantics)', () => {
    it('replaces the whole set and validates it', async () => {
      const { cookie } = await registerUser(ctx.app);
      const call = as(ctx.app, cookie);

      const av = await call({
        method: 'PUT',
        url: '/api/v1/availability',
        payload: {
          items: [
            { weekday: 1, maxMinutes: 60, kind: 'gym', startTime: '18:00', endTime: '19:00' },
          ],
        },
      });
      expect(av.statusCode).toBe(200);
      expect(av.json()).toMatchObject({
        items: [{ weekday: 1, startTime: '18:00', endTime: '19:00', kind: 'gym' }],
      });

      const replaced = await call({
        method: 'PUT',
        url: '/api/v1/availability',
        payload: { items: [{ weekday: 3, maxMinutes: 45, kind: 'any' }] },
      });
      expect(replaced.json<{ items: unknown[] }>().items).toHaveLength(1);

      const badTimes = await call({
        method: 'PUT',
        url: '/api/v1/availability',
        payload: {
          items: [
            { weekday: 1, maxMinutes: 60, kind: 'gym', startTime: '19:00', endTime: '18:00' },
          ],
        },
      });
      expect(badTimes.statusCode).toBe(400);
      expect(badTimes.json()).toMatchObject({ errors: [{ field: 'items.0.endTime' }] });

      const eq = await call({
        method: 'PUT',
        url: '/api/v1/equipment',
        payload: {
          items: [
            { equipmentCode: 'barbell', location: 'gym' },
            { equipmentCode: 'barbell', location: 'gym' },
          ],
        },
      });
      expect(eq.statusCode).toBe(200);
      const eqBody = eq.json<{ catalog: { code: string }[]; items: unknown[] }>();
      expect(eqBody.items).toEqual([{ equipmentCode: 'barbell', location: 'gym' }]);
      expect(eqBody.catalog.map((c) => c.code)).toContain('dumbbell');

      const unknownEq = await call({
        method: 'PUT',
        url: '/api/v1/equipment',
        payload: { items: [{ equipmentCode: 'teleporter', location: 'gym' }] },
      });
      expect(unknownEq.statusCode).toBe(400);

      const sp = await call({
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
      expect(sp.json()).toMatchObject({ items: [{ sportCode: 'football', weekdayHint: null }] });
      const spBad = await call({
        method: 'PUT',
        url: '/api/v1/sports',
        payload: {
          items: [
            { sportCode: 'chess', weeklyFrequency: 0, typicalDurationMin: 90, typicalIntensity: 9 },
          ],
        },
      });
      expect(spBad.statusCode).toBe(400);
    });
  });

  describe('limitations CRUD', () => {
    it('creates, updates, deletes and returns 404 for missing ids', async () => {
      const { cookie } = await registerUser(ctx.app);
      const call = as(ctx.app, cookie);
      const created = await call({
        method: 'POST',
        url: '/api/v1/limitations',
        payload: {
          bodyRegion: 'joelho',
          severity: 2,
          contraindicatedPatterns: ['deep_knee_flexion'],
        },
      });
      expect(created.statusCode).toBe(201);
      const { id } = created.json<{ id: string }>();

      const patched = await call({
        method: 'PATCH',
        url: `/api/v1/limitations/${id}`,
        payload: { active: false },
      });
      expect(patched.json()).toMatchObject({ id, active: false, bodyRegion: 'joelho' });

      expect(
        (await call({ method: 'GET', url: '/api/v1/limitations' })).json<{ items: unknown[] }>()
          .items,
      ).toHaveLength(1);
      expect((await call({ method: 'DELETE', url: `/api/v1/limitations/${id}` })).statusCode).toBe(
        204,
      );
      expect((await call({ method: 'DELETE', url: `/api/v1/limitations/${id}` })).statusCode).toBe(
        404,
      );
      expect(
        (
          await call({
            method: 'PATCH',
            url: `/api/v1/limitations/${MISSING}`,
            payload: { active: true },
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (await call({ method: 'POST', url: '/api/v1/limitations', payload: { severity: 5 } }))
          .statusCode,
      ).toBe(400);
    });
  });

  describe('goals (versioned)', () => {
    it('only inserts; history is newest first and POST returns the targets impact', async () => {
      const u = await onboardedUser(ctx.app, today);
      const second = await u.call({
        method: 'POST',
        url: '/api/v1/goals',
        payload: { primaryGoal: 'maintenance' },
      });
      expect(second.statusCode).toBe(201);
      const body = second.json<{
        goal: { primaryGoal: string; effectiveFrom: string };
        targets: { blocked: null; targets: { kcal: number } };
      }>();
      expect(body.goal).toMatchObject({ primaryGoal: 'maintenance', effectiveFrom: today });
      expect(body.targets.blocked).toBeNull();
      expect(body.targets.targets.kcal).toBeGreaterThan(0);

      const list = (await u.call({ method: 'GET', url: '/api/v1/goals' })).json<{
        items: { primaryGoal: string }[];
      }>();
      expect(list.items.map((g) => g.primaryGoal)).toEqual(['maintenance', 'fat_loss']);

      const bad = await u.call({
        method: 'POST',
        url: '/api/v1/goals',
        payload: { primaryGoal: 'fat_loss', targetRatePctPerWeek: -3 },
      });
      expect(bad.statusCode).toBe(400);
    });
  });

  describe('isolation between users', () => {
    it("user B never sees or changes user A's data", async () => {
      const a = await onboardedUser(ctx.app, today);
      await a.call({
        method: 'PUT',
        url: '/api/v1/sports',
        payload: {
          items: [
            {
              sportCode: 'running',
              weeklyFrequency: 2,
              typicalDurationMin: 30,
              typicalIntensity: 3,
            },
          ],
        },
      });
      await a.call({
        method: 'PUT',
        url: '/api/v1/availability',
        payload: { items: [{ weekday: 1, maxMinutes: 60, kind: 'gym' }] },
      });
      await a.call({
        method: 'PUT',
        url: '/api/v1/equipment',
        payload: { items: [{ equipmentCode: 'dumbbell', location: 'home' }] },
      });
      const lim = (
        await a.call({
          method: 'POST',
          url: '/api/v1/limitations',
          payload: { bodyRegion: 'ombro', severity: 1 },
        })
      ).json<{ id: string }>();

      const b = await registerUser(ctx.app);
      const callB = as(ctx.app, b.cookie);
      expect((await callB({ method: 'GET', url: '/api/v1/profile' })).json()).toEqual({
        profile: null,
        onboardingComplete: false,
      });
      for (const url of [
        '/api/v1/goals',
        '/api/v1/sports',
        '/api/v1/availability',
        '/api/v1/limitations',
      ]) {
        expect(
          (await callB({ method: 'GET', url })).json<{ items: unknown[] }>().items,
          url,
        ).toEqual([]);
      }
      expect(
        (await callB({ method: 'GET', url: '/api/v1/equipment' })).json<{ items: unknown[] }>()
          .items,
      ).toEqual([]);
      expect(
        (
          await callB({
            method: 'PATCH',
            url: `/api/v1/limitations/${lim.id}`,
            payload: { active: false },
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (await callB({ method: 'DELETE', url: `/api/v1/limitations/${lim.id}` })).statusCode,
      ).toBe(404);

      // Substituir o conjunto de B não afeta A.
      await callB({ method: 'PUT', url: '/api/v1/sports', payload: { items: [] } });
      expect(
        (await a.call({ method: 'GET', url: '/api/v1/sports' })).json<{ items: unknown[] }>().items,
      ).toHaveLength(1);
      expect(
        (await a.call({ method: 'GET', url: '/api/v1/limitations' })).json<{ items: unknown[] }>()
          .items,
      ).toHaveLength(1);
    });
  });

  it('ageOn helper sanity (used by targets)', () => {
    expect(ageOn('1990-01-01', today)).toBeGreaterThanOrEqual(36);
  });
});
