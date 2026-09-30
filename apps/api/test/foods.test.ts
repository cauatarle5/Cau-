import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { localDate } from '@atlas/core';

import { as, createTestApp, onboardedUser, registerUser, type TestContext } from './helpers';

const today = localDate(new Date(), 'America/Sao_Paulo');
const MISSING = '00000000-0000-7000-8000-000000000000';

interface Food {
  id: string;
  namePt: string;
  isCustom: boolean;
  per100: Record<string, number | null>;
  measures: { unitCode: string; grams: number; scope: string }[];
}

describe('foods', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  it('requires authentication', async () => {
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/v1/foods/search?q=arroz' })).statusCode,
    ).toBe(401);
  });

  it('searches TACO by name and alias with default cooked state (P6.2)', async () => {
    const { cookie } = await registerUser(ctx.app);
    const call = as(ctx.app, cookie);
    const search = async (q: string) =>
      (await call({ method: 'GET', url: `/api/v1/foods/search?q=${encodeURIComponent(q)}` })).json<{
        items: Food[];
      }>().items;

    expect((await search('arroz'))[0]?.namePt).toBe('Arroz, tipo 1, cozido');
    expect((await search('frango'))[0]?.namePt).toBe('Frango, peito, sem pele, grelhado');
    expect((await search('feijão'))[0]?.namePt).toBe('Feijão, carioca, cozido');
    expect((await search('arroz cru'))[0]?.namePt).toBe('Arroz, tipo 1, cru');
    expect((await search('pão francês'))[0]?.namePt).toBe('Pão, trigo, francês');

    const rice = (await search('arroz'))[0];
    // TACO: 128 kcal, 2,5 P, 28,1 C, 0,2 G por 100 g
    expect(rice?.per100).toMatchObject({ kcal: 128, proteinG: 2.5, carbsG: 28.1, fatG: 0.2 });
    expect(rice?.measures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ unitCode: 'tbsp', grams: 25, scope: 'food' }),
      ]),
    );

    const bad = await call({ method: 'GET', url: '/api/v1/foods/search?q=' });
    expect(bad.statusCode).toBe(400);
  });

  it('creates a custom food from label values (per portion → per 100 g) and adds measures', async () => {
    const { cookie } = await registerUser(ctx.app);
    const call = as(ctx.app, cookie);
    // Rótulo: porção de 30 g = 120 kcal, 24 g proteína, 3 g carbo, 1,5 g gordura
    const res = await call({
      method: 'POST',
      url: '/api/v1/foods',
      payload: {
        namePt: 'Whey Protein Baunilha',
        brand: 'Marca X',
        category: 'supplements',
        referenceAmount: 30,
        kcal: 120,
        proteinG: 24,
        carbsG: 3,
        fatG: 1.5,
        measures: [{ unitCode: 'scoop', labelPt: '1 scoop', grams: 30 }],
      },
    });
    expect(res.statusCode).toBe(201);
    const food = res.json<Food>();
    expect(food.isCustom).toBe(true);
    expect(food.per100.kcal).toBeCloseTo(400, 6);
    expect(food.per100.proteinG).toBeCloseTo(80, 6);
    expect(food.per100.fiberG).toBeNull();
    expect(food.measures).toEqual(
      expect.arrayContaining([expect.objectContaining({ unitCode: 'scoop', grams: 30 })]),
    );

    const found = (await call({ method: 'GET', url: '/api/v1/foods/search?q=whey' })).json<{
      items: Food[];
    }>();
    expect(found.items[0]?.id).toBe(food.id);

    const measured = await call({
      method: 'POST',
      url: `/api/v1/foods/${food.id}/measures`,
      payload: { unitCode: 'tbsp', labelPt: 'colher de sopa', grams: 10 },
    });
    expect(measured.statusCode).toBe(201);

    expect((await call({ method: 'GET', url: `/api/v1/foods/${MISSING}` })).json()).toMatchObject({
      code: 'FOOD_NOT_FOUND',
    });
    expect(
      (await call({ method: 'POST', url: '/api/v1/foods', payload: { namePt: '' } })).statusCode,
    ).toBe(400);
  });

  it("isolates custom foods: B cannot see or use A's food", async () => {
    const a = await registerUser(ctx.app);
    const created = await as(
      ctx.app,
      a.cookie,
    )({
      method: 'POST',
      url: '/api/v1/foods',
      payload: {
        namePt: 'Granola da casa zzqx',
        referenceAmount: 40,
        kcal: 180,
        proteinG: 4,
        carbsG: 28,
        fatG: 6,
      },
    });
    const id = created.json<Food>().id;
    const b = await registerUser(ctx.app);
    const callB = as(ctx.app, b.cookie);
    expect((await callB({ method: 'GET', url: `/api/v1/foods/${id}` })).statusCode).toBe(404);
    const search = (
      await callB({ method: 'GET', url: '/api/v1/foods/search?q=granola%20da%20casa%20zzqx' })
    ).json<{
      items: Food[];
    }>();
    expect(search.items.map((f) => f.id)).not.toContain(id);
    const meal = await callB({
      method: 'POST',
      url: '/api/v1/meals',
      payload: { date: today, slot: 'lunch', items: [{ foodId: id, quantity: 40, unit: 'g' }] },
    });
    expect(meal.statusCode).toBe(404);
    expect(
      (
        await callB({
          method: 'POST',
          url: `/api/v1/foods/${id}/measures`,
          payload: { unitCode: 'tbsp', labelPt: 'x', grams: 1 },
        })
      ).statusCode,
    ).toBe(404);
  });

  it('onboarded helper still works with foods present', async () => {
    const u = await onboardedUser(ctx.app, today);
    expect(u.cookie).toContain('atlas_session=');
  });
});
