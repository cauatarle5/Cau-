import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDate } from '@atlas/core';

import { as, createTestApp, registerUser, type TestContext } from './helpers';

const today = localDate(new Date(), 'America/Sao_Paulo');
const MISSING = '00000000-0000-7000-8000-000000000000';

describe('body module', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  it('requires authentication', async () => {
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/v1/body-measurements' })).statusCode,
    ).toBe(401);
    expect(
      (await ctx.app.inject({ method: 'GET', url: `/api/v1/body/trend?from=${today}&to=${today}` }))
        .statusCode,
    ).toBe(401);
  });

  it('creates measurements, lists newest first with a cursor, patches and soft-deletes', async () => {
    const { cookie } = await registerUser(ctx.app);
    const call = as(ctx.app, cookie);
    const d0 = addDays(today, -2);
    const d1 = addDays(today, -1);

    const first = await call({
      method: 'POST',
      url: '/api/v1/body-measurements',
      payload: { date: d0, weightKg: 80, waistCm: 85 },
    });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      measurement: { date: d0, weightKg: 80, waistCm: 85, hipCm: null },
      warnings: [],
    });
    await call({
      method: 'POST',
      url: '/api/v1/body-measurements',
      payload: { date: d1, weightKg: 79.8 },
    });
    const third = await call({
      method: 'POST',
      url: '/api/v1/body-measurements',
      payload: { date: today, bodyFatPct: 18, bodyFatMethod: 'bioimpedance' },
    });
    const thirdId = third.json<{ measurement: { id: string } }>().measurement.id;

    const page1 = (await call({ method: 'GET', url: '/api/v1/body-measurements?limit=2' })).json<{
      items: { date: string }[];
      nextCursor: string | null;
    }>();
    expect(page1.items.map((i) => i.date)).toEqual([today, d1]);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = (
      await call({
        method: 'GET',
        url: `/api/v1/body-measurements?limit=2&cursor=${page1.nextCursor ?? ''}`,
      })
    ).json<{ items: { date: string }[]; nextCursor: string | null }>();
    expect(page2.items.map((i) => i.date)).toEqual([d0]);
    expect(page2.nextCursor).toBeNull();

    const patched = await call({
      method: 'PATCH',
      url: `/api/v1/body-measurements/${thirdId}`,
      payload: { neckCm: 38 },
    });
    expect(patched.json()).toMatchObject({ neckCm: 38, bodyFatPct: 18 });

    // Remover o único valor quebraria a regra "ao menos uma medida".
    const emptied = await call({
      method: 'PATCH',
      url: `/api/v1/body-measurements/${thirdId}`,
      payload: { neckCm: null, bodyFatPct: null },
    });
    expect(emptied.statusCode).toBe(400);

    expect(
      (await call({ method: 'DELETE', url: `/api/v1/body-measurements/${thirdId}` })).statusCode,
    ).toBe(204);
    expect(
      (await call({ method: 'DELETE', url: `/api/v1/body-measurements/${thirdId}` })).statusCode,
    ).toBe(404);
    expect(
      (
        await call({
          method: 'PATCH',
          url: `/api/v1/body-measurements/${MISSING}`,
          payload: { neckCm: 38 },
        })
      ).statusCode,
    ).toBe(404);
    const after = (await call({ method: 'GET', url: '/api/v1/body-measurements' })).json<{
      items: unknown[];
    }>();
    expect(after.items).toHaveLength(2);
  });

  it('validates input (at least one value, ranges, method with body fat, cursor)', async () => {
    const { cookie } = await registerUser(ctx.app);
    const call = as(ctx.app, cookie);
    for (const payload of [
      { date: today },
      { date: today, weightKg: 400 },
      { date: today, bodyFatPct: 20 },
      { date: '30/09/2026', weightKg: 80 },
      { date: addDays(today, 2), weightKg: 80 },
    ]) {
      const res = await call({ method: 'POST', url: '/api/v1/body-measurements', payload });
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    expect(
      (await call({ method: 'GET', url: '/api/v1/body-measurements?cursor=garbage' })).statusCode,
    ).toBe(400);
  });

  it('warns (without blocking) on an unusual weight change (ADR-018)', async () => {
    const { cookie } = await registerUser(ctx.app);
    const call = as(ctx.app, cookie);
    await call({
      method: 'POST',
      url: '/api/v1/body-measurements',
      payload: { date: addDays(today, -1), weightKg: 80 },
    });
    const res = await call({
      method: 'POST',
      url: '/api/v1/body-measurements',
      payload: { date: today, weightKg: 83 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ warnings: ['WEIGHT_CHANGE_UNUSUAL'] });
  });

  it('computes the weight trend (EMA, daily average) and slices to the period', async () => {
    const { cookie } = await registerUser(ctx.app);
    const call = as(ctx.app, cookie);
    const d = (n: number) => addDays(today, n - 3);
    await call({
      method: 'POST',
      url: '/api/v1/body-measurements',
      payload: { date: d(0), weightKg: 80 },
    });
    await call({
      method: 'POST',
      url: '/api/v1/body-measurements',
      payload: { date: d(1), weightKg: 80.5 },
    });
    await call({
      method: 'POST',
      url: '/api/v1/body-measurements',
      payload: { date: d(1), weightKg: 81.5 },
    });
    await call({
      method: 'POST',
      url: '/api/v1/body-measurements',
      payload: { date: d(3), weightKg: 79 },
    });

    const res = await call({ method: 'GET', url: `/api/v1/body/trend?from=${d(1)}&to=${d(3)}` });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      points: { date: string; weightKg: number; trendKg: number }[];
      latest: { trendKg: number };
    }>();
    // Dia 1: média 81 → 80 + 0,1 × 1 = 80,1; dia 3: 80,1 + 0,1 × (79 − 80,1) = 79,99
    expect(body.points.map((p) => p.date)).toEqual([d(1), d(3)]);
    expect(body.points[0]?.weightKg).toBe(81);
    expect(body.points[0]?.trendKg).toBeCloseTo(80.1, 6);
    expect(body.latest.trendKg).toBeCloseTo(79.99, 6);

    const bad = await call({ method: 'GET', url: `/api/v1/body/trend?from=${d(3)}&to=${d(1)}` });
    expect(bad.statusCode).toBe(400);
  });

  it('isolates measurements between users', async () => {
    const a = await registerUser(ctx.app);
    const created = await as(
      ctx.app,
      a.cookie,
    )({
      method: 'POST',
      url: '/api/v1/body-measurements',
      payload: { date: today, weightKg: 90 },
    });
    const id = created.json<{ measurement: { id: string } }>().measurement.id;

    const b = await registerUser(ctx.app);
    const callB = as(ctx.app, b.cookie);
    expect((await callB({ method: 'GET', url: '/api/v1/body-measurements' })).json()).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(
      (await callB({ method: 'GET', url: `/api/v1/body/trend?from=${today}&to=${today}` })).json(),
    ).toEqual({
      points: [],
      latest: null,
    });
    expect(
      (
        await callB({
          method: 'PATCH',
          url: `/api/v1/body-measurements/${id}`,
          payload: { weightKg: 50 },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await callB({ method: 'DELETE', url: `/api/v1/body-measurements/${id}` })).statusCode,
    ).toBe(404);
  });
});
