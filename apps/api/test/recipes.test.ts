import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDate } from '@atlas/core';

import { as, createTestApp, onboardedUser, registerUser, type TestContext } from './helpers';

const today = localDate(new Date(), 'America/Sao_Paulo');
const MISSING = '00000000-0000-7000-8000-000000000000';

type Call = ReturnType<typeof as>;
interface N {
  kcal: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
}
interface Recipe {
  id: string;
  name: string;
  foodId: string;
  servings: number;
  isFavorite: boolean;
  ingredients: { foodName: string; grams: number; nutrients: N }[];
  nutrition: { total: N; perServing: N; per100: N; totalGrams: number; servingGrams: number };
}
interface Meal {
  id: string;
  slot: string;
  status: string;
  items: { id: string; foodId: string; foodName: string; grams: number; nutrients: N }[];
  totals: N;
}
interface DayPlan {
  summary: {
    targets: { fatG: number; kcal: number } | null;
    consumed: { kcal: number };
    planned: { kcal: number; fatG: number };
  };
  alerts: { kind: string; nutrient: string; itemId?: string | null; excess?: number }[];
}

async function foodId(call: Call, q: string, name: string): Promise<string> {
  const res = await call({ method: 'GET', url: `/api/v1/foods/search?q=${encodeURIComponent(q)}` });
  const hit = res
    .json<{ items: { id: string; namePt: string }[] }>()
    .items.find((f) => f.namePt === name);
  if (!hit) throw new Error(`food not found: ${name}`);
  return hit.id;
}

describe('recipes and day planning', () => {
  let ctx: TestContext;
  let chicken: string;
  let rice: string;
  let mozzarella: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    const u = await registerUser(ctx.app);
    const call = as(ctx.app, u.cookie);
    chicken = await foodId(call, 'frango grelhado', 'Frango, peito, sem pele, grelhado');
    rice = await foodId(call, 'arroz cozido', 'Arroz, tipo 1, cozido');
    mozzarella = await foodId(call, 'mussarela', 'Queijo, mozarela');
  });
  afterAll(() => ctx.close());

  const recipePayload = () => ({
    name: 'Arroz com frango da casa',
    servings: 2,
    cookedWeightG: 250,
    ingredients: [
      { foodId: chicken, quantity: 200, unit: 'g' },
      { foodId: rice, quantity: 100, unit: 'g' },
    ],
  });

  it('computes total, per serving and per 100 g; registers by portion; edits keep past meals', async () => {
    const u = await registerUser(ctx.app);
    const call = as(ctx.app, u.cookie);
    const res = await call({ method: 'POST', url: '/api/v1/recipes', payload: recipePayload() });
    expect(res.statusCode).toBe(201);
    const r = res.json<Recipe>();
    // TACO: frango grelhado 159 kcal × 2 = 318; arroz cozido 128 → 446 kcal.
    expect(r.nutrition.total.kcal).toBeCloseTo(446, 6);
    expect(r.nutrition.perServing.kcal).toBeCloseTo(223, 6);
    // Peso cozido 250 g: 446 × 100 / 250 = 178,4 kcal/100 g; porção 125 g.
    expect(r.nutrition.per100.kcal).toBeCloseTo(178.4, 6);
    expect(r.nutrition.servingGrams).toBe(125);
    // Proteína: 32 × 2 + 2,5 = 66,5 g.
    expect(r.nutrition.total.proteinG).toBeCloseTo(66.5, 6);
    expect(r.ingredients.map((i) => [i.foodName, i.grams])).toEqual([
      ['Frango, peito, sem pele, grelhado', 200],
      ['Arroz, tipo 1, cozido', 100],
    ]);

    // A receita aparece na busca como alimento e é registrada por porção.
    const found = await foodId(call, 'arroz com frango', 'Arroz com frango da casa');
    expect(found).toBe(r.foodId);
    const meal = await call({
      method: 'POST',
      url: '/api/v1/meals',
      payload: {
        date: today,
        slot: 'lunch',
        items: [{ foodId: r.foodId, quantity: 1, unit: 'portion' }],
      },
    });
    expect(meal.statusCode).toBe(201);
    const m = meal.json<Meal>();
    expect(m.items[0]?.grams).toBe(125);
    expect(m.items[0]?.nutrients.kcal).toBeCloseTo(223, 6);

    // Editar para 1 porção muda a porção (250 g) mas não a refeição registrada.
    const edited = await call({
      method: 'PATCH',
      url: `/api/v1/recipes/${r.id}`,
      payload: { servings: 1, isFavorite: true },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json<Recipe>().nutrition.servingGrams).toBe(250);
    expect(edited.json<Recipe>().isFavorite).toBe(true);
    const meals = await call({ method: 'GET', url: `/api/v1/meals?date=${today}` });
    expect(meals.json<{ items: Meal[] }>().items[0]?.items[0]?.nutrients.kcal).toBeCloseTo(223, 6);

    const dup = await call({ method: 'POST', url: `/api/v1/recipes/${r.id}/duplicate` });
    expect(dup.statusCode).toBe(201);
    expect(dup.json<Recipe>().name).toBe('Arroz com frango da casa (cópia)');
    expect(dup.json<Recipe>().foodId).not.toBe(r.foodId);

    // Excluir tira da busca; a receita some da lista.
    expect((await call({ method: 'DELETE', url: `/api/v1/recipes/${r.id}` })).statusCode).toBe(204);
    const search = await call({
      method: 'GET',
      url: '/api/v1/foods/search?q=arroz%20com%20frango',
    });
    expect(search.json<{ items: { id: string }[] }>().items.map((f) => f.id)).not.toContain(
      r.foodId,
    );
    const list = await call({ method: 'GET', url: '/api/v1/recipes' });
    expect(list.json<{ items: Recipe[] }>().items.map((x) => x.id)).toEqual([
      dup.json<Recipe>().id,
    ]);
  });

  it('validates recipes and isolates users', async () => {
    const a = await registerUser(ctx.app);
    const b = await registerUser(ctx.app);
    const callA = as(ctx.app, a.cookie);
    const callB = as(ctx.app, b.cookie);
    const empty = await callA({
      method: 'POST',
      url: '/api/v1/recipes',
      payload: { name: 'Vazia', ingredients: [] },
    });
    expect(empty.statusCode).toBe(400);
    const r = (
      await callA({ method: 'POST', url: '/api/v1/recipes', payload: recipePayload() })
    ).json<Recipe>();
    const self = await callA({
      method: 'PATCH',
      url: `/api/v1/recipes/${r.id}`,
      payload: { ingredients: [{ foodId: r.foodId, quantity: 100, unit: 'g' }] },
    });
    expect(self.statusCode).toBe(400);
    const noUnit = await callA({
      method: 'PATCH',
      url: `/api/v1/recipes/${r.id}`,
      payload: { ingredients: [{ foodId: chicken, quantity: 1, unit: 'scoop' }] },
    });
    expect(noUnit.statusCode).toBe(422);
    expect(noUnit.json<{ code: string }>().code).toBe('UNIT_NOT_CONVERTIBLE');

    for (const res of await Promise.all([
      callB({ method: 'GET', url: `/api/v1/recipes/${r.id}` }),
      callB({ method: 'PATCH', url: `/api/v1/recipes/${r.id}`, payload: { name: 'x' } }),
      callB({ method: 'DELETE', url: `/api/v1/recipes/${r.id}` }),
      callB({ method: 'POST', url: `/api/v1/recipes/${r.id}/duplicate` }),
      callB({ method: 'GET', url: `/api/v1/foods/${r.foodId}` }),
      callB({ method: 'GET', url: `/api/v1/recipes/${MISSING}` }),
    ])) {
      expect(res.statusCode).toBe(404);
    }
    expect(
      (await callB({ method: 'GET', url: '/api/v1/recipes' })).json<{ items: unknown[] }>().items,
    ).toEqual([]);
  });

  it('DoD Fase 4: day plan alerts on fat, suggests a leaner swap, applies it and logs the meal', async () => {
    const u = await onboardedUser(ctx.app, today);
    const plan0 = (
      await u.call({ method: 'GET', url: `/api/v1/nutrition/day-plan?date=${today}` })
    ).json<DayPlan>();
    const fatTarget = plan0.summary.targets?.fatG ?? 0;
    expect(fatTarget).toBeGreaterThan(0);
    // Muçarela suficiente para passar 120% da meta de gordura (25,2 g/100 g).
    const grams = Math.ceil((fatTarget * 1.2) / 0.252);
    const breakfast = (
      await u.call({
        method: 'POST',
        url: '/api/v1/meals',
        payload: {
          date: today,
          slot: 'breakfast',
          status: 'planned',
          items: [{ foodId: mozzarella, quantity: grams, unit: 'g' }],
        },
      })
    ).json<Meal>();
    const itemId = breakfast.items[0]?.id ?? '';

    const plan = (
      await u.call({ method: 'GET', url: `/api/v1/nutrition/day-plan?date=${today}` })
    ).json<DayPlan>();
    expect(plan.summary.planned.fatG).toBeCloseTo(grams * 0.252, 6);
    const fat = plan.alerts.find((a) => a.kind === 'over' && a.nutrient === 'fatG');
    expect(fat).toMatchObject({ itemId });
    expect(fat?.excess).toBeCloseTo(grams * 0.252 - fatTarget, 6);

    const subs = await u.call({
      method: 'POST',
      url: '/api/v1/nutrition/substitutions',
      payload: { itemId, nutrient: 'fatG' },
    });
    expect(subs.statusCode).toBe(200);
    const body = subs.json<{
      original: { grams: number; nutrients: N };
      items: {
        food: { id: string; namePt: string; category: string };
        grams: number;
        nutrients: N;
        reduction: number;
      }[];
    }>();
    expect(body.items.length).toBeGreaterThan(0);
    const best = body.items[0];
    // Ricota (TACO 12,6 g proteína / 8,1 g gordura): proteína ≥ 90% arredondando para 5 g.
    expect(best?.food.namePt).toBe('Queijo, ricota');
    const origProtein = body.original.nutrients.proteinG ?? 0;
    expect(best?.grams).toBe(Math.ceil((origProtein * 0.9 * 100) / 12.6 / 5 - 1e-9) * 5);
    expect(best?.nutrients.proteinG ?? 0).toBeGreaterThanOrEqual(origProtein * 0.9 - 1e-9);
    for (const o of body.items) {
      expect(o.food.category).toBe('dairy');
      expect(o.reduction).toBeGreaterThan(0);
      expect(o.nutrients.kcal ?? 0).toBeLessThanOrEqual(
        (body.original.nutrients.kcal ?? 0) * 1.15 + 1e-9,
      );
    }

    // Aplicar a troca devolve a gordura prevista para dentro da faixa.
    await u.call({
      method: 'PATCH',
      url: `/api/v1/meal-items/${itemId}`,
      payload: { foodId: best?.food.id, quantity: best?.grams, unit: 'g' },
    });
    const after = (
      await u.call({ method: 'GET', url: `/api/v1/nutrition/day-plan?date=${today}` })
    ).json<DayPlan>();
    expect(after.alerts.find((a) => a.nutrient === 'fatG')).toBeUndefined();

    const logged = await u.call({
      method: 'POST',
      url: `/api/v1/meals/${breakfast.id}/log`,
      payload: {},
    });
    expect(logged.statusCode).toBe(200);
    expect(logged.json<Meal>().status).toBe('logged');
    const final = (
      await u.call({ method: 'GET', url: `/api/v1/nutrition/day-plan?date=${today}` })
    ).json<DayPlan>();
    expect(final.summary.planned.kcal).toBe(0);
    expect(final.summary.consumed.kcal).toBeGreaterThan(0);
  });

  it('templates from a meal or a day, copy to another day, and suggestions from history', async () => {
    const u = await onboardedUser(ctx.app, today);
    const tomorrow = addDays(today, 1);
    const lunch = (
      await u.call({
        method: 'POST',
        url: '/api/v1/meals',
        payload: {
          date: today,
          slot: 'lunch',
          items: [
            { foodId: chicken, quantity: 150, unit: 'g' },
            { foodId: rice, quantity: 200, unit: 'g' },
          ],
        },
      })
    ).json<Meal>();
    await u.call({
      method: 'POST',
      url: '/api/v1/meals',
      payload: {
        date: today,
        slot: 'dinner',
        status: 'planned',
        items: [{ foodId: chicken, quantity: 120, unit: 'g' }],
      },
    });

    const dayTpl = await u.call({
      method: 'POST',
      url: '/api/v1/meal-templates',
      payload: { name: 'Dia padrão', date: today },
    });
    expect(dayTpl.statusCode).toBe(201);
    expect(dayTpl.json<{ slotHint: string | null; items: unknown[] }>()).toMatchObject({
      slotHint: null,
    });
    expect(dayTpl.json<{ items: unknown[] }>().items).toHaveLength(3);
    const mealTpl = (
      await u.call({
        method: 'POST',
        url: '/api/v1/meal-templates',
        payload: { name: 'Almoço', mealId: lunch.id },
      })
    ).json<{ id: string; slotHint: string }>();
    expect(mealTpl.slotHint).toBe('lunch');

    const copied = await u.call({
      method: 'POST',
      url: '/api/v1/meals/copy',
      payload: { fromDate: today, toDate: tomorrow },
    });
    expect(copied.statusCode).toBe(201);
    const copiedMeals = copied.json<{ items: Meal[] }>().items;
    expect(copiedMeals.map((m) => [m.slot, m.status, m.items.length])).toEqual([
      ['lunch', 'planned', 2],
      ['dinner', 'planned', 1],
    ]);
    expect(copiedMeals[0]?.totals.kcal).toBeCloseTo(lunch.totals.kcal ?? 0, 6);

    const applied = await u.call({
      method: 'POST',
      url: '/api/v1/meals/copy',
      payload: { templateId: mealTpl.id, toDate: tomorrow, slot: 'supper' },
    });
    expect(applied.json<{ items: Meal[] }>().items.map((m) => m.slot)).toEqual(['supper']);

    const both = await u.call({
      method: 'POST',
      url: '/api/v1/meals/copy',
      payload: { templateId: mealTpl.id, fromDate: today, toDate: tomorrow },
    });
    expect(both.statusCode).toBe(400);

    // Sugestão só com alimentos do histórico, dentro dos limites pedidos.
    const c = { kcal: 600, proteinMin: 40, carbsMax: 80, fatMax: 25 };
    const sug = await u.call({
      method: 'POST',
      url: '/api/v1/nutrition/suggest-meal',
      payload: { date: tomorrow, ...c },
    });
    expect(sug.statusCode).toBe(200);
    const s = sug.json<{
      options: {
        items: { food: { id: string } }[];
        totals: { kcal: number; proteinG: number; carbsG: number; fatG: number };
      }[];
    }>();
    expect(s.options.length).toBeGreaterThan(0);
    for (const o of s.options) {
      expect(o.totals.kcal).toBeLessThanOrEqual(c.kcal + 1e-6);
      expect(o.totals.proteinG).toBeGreaterThanOrEqual(c.proteinMin - 1e-6);
      expect(o.totals.carbsG).toBeLessThanOrEqual(c.carbsMax + 1e-6);
      expect(o.totals.fatG).toBeLessThanOrEqual(c.fatMax + 1e-6);
      for (const i of o.items) expect([chicken, rice]).toContain(i.food.id);
    }

    // Isolamento.
    const other = await registerUser(ctx.app);
    const callB = as(ctx.app, other.cookie);
    for (const res of await Promise.all([
      callB({ method: 'POST', url: `/api/v1/meals/${lunch.id}/log`, payload: {} }),
      callB({ method: 'DELETE', url: `/api/v1/meal-templates/${mealTpl.id}` }),
      callB({
        method: 'POST',
        url: '/api/v1/meals/copy',
        payload: { templateId: mealTpl.id, toDate: tomorrow },
      }),
      callB({
        method: 'POST',
        url: '/api/v1/nutrition/substitutions',
        payload: { itemId: lunch.items[0]?.id, nutrient: 'fatG' },
      }),
      callB({
        method: 'POST',
        url: '/api/v1/meal-templates',
        payload: { name: 'x', mealId: lunch.id },
      }),
    ])) {
      expect(res.statusCode).toBe(404);
    }
    const bSug = await callB({
      method: 'POST',
      url: '/api/v1/nutrition/suggest-meal',
      payload: { date: today, ...c },
    });
    expect(bSug.json<{ options: unknown[] }>().options).toEqual([]);
    expect(
      (await callB({ method: 'GET', url: '/api/v1/meal-templates' })).json<{ items: unknown[] }>()
        .items,
    ).toEqual([]);
    expect(
      (await u.call({ method: 'DELETE', url: `/api/v1/meal-templates/${mealTpl.id}` })).statusCode,
    ).toBe(204);
  });
});
