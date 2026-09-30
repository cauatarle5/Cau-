import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDate } from '@atlas/core';

import { as, createTestApp, onboardedUser, registerUser, type TestContext } from './helpers';

const today = localDate(new Date(), 'America/Sao_Paulo');
const MISSING = '00000000-0000-7000-8000-000000000000';

interface ParsedItem {
  foodQuery: string;
  quantity: number;
  unit: string | null;
  match: { id: string; namePt: string } | null;
  confidence: string;
  alternatives: { id: string }[];
  grams: number | null;
  nutrients: { kcal: number; proteinG: number } | null;
  error: string | null;
}

describe('nutrition parse and meals', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  it('DoD Fase 2: "200g de arroz, 150g de frango e 100g de feijão" matches TACO values', async () => {
    const u = await onboardedUser(ctx.app, today);
    const text = '200g de arroz, 150g de frango e 100g de feijão';
    const parse = await u.call({
      method: 'POST',
      url: '/api/v1/nutrition/parse',
      payload: { text },
    });
    expect(parse.statusCode).toBe(200);
    const body = parse.json<{
      source: string;
      items: ParsedItem[];
      totals: { kcal: number; proteinG: number };
    }>();
    expect(body.source).toBe('rules');
    // Alias curado exato → "auto" já no primeiro uso (ADR-032).
    expect(body.items.map((i) => i.confidence)).toEqual(['auto', 'auto', 'auto']);
    expect(body.items.map((i) => [i.match?.namePt, i.grams])).toEqual([
      ['Arroz, tipo 1, cozido', 200],
      ['Frango, peito, sem pele, grelhado', 150],
      ['Feijão, carioca, cozido', 100],
    ]);
    // TACO: arroz 128 × 2 = 256; frango 159 × 1,5 = 238,5; feijão 76 → 570,5 kcal
    expect(body.items.map((i) => i.nutrients?.kcal)).toEqual([256, 238.5, 76]);
    expect(body.totals.kcal).toBeCloseTo(570.5, 6);
    // Proteína: 5 + 48 + 4,8 = 57,8 g
    expect(body.totals.proteinG).toBeCloseTo(57.8, 6);

    const meal = await u.call({
      method: 'POST',
      url: '/api/v1/meals',
      payload: {
        date: today,
        slot: 'lunch',
        sourceText: text,
        items: body.items.map((i) => ({
          foodId: i.match?.id,
          quantity: i.quantity,
          unit: i.unit,
          query: i.foodQuery,
          suggestedFoodId: i.match?.id,
        })),
      },
    });
    expect(meal.statusCode).toBe(201);
    expect(meal.json<{ totals: { kcal: number } }>().totals.kcal).toBeCloseTo(570.5, 6);

    const summary = (
      await u.call({ method: 'GET', url: `/api/v1/nutrition/day-summary?date=${today}` })
    ).json<{
      consumed: { kcal: number };
      targets: { kcal: number };
      remaining: { kcal: number };
      loggedMeals: number;
    }>();
    expect(summary.consumed.kcal).toBeCloseTo(570.5, 6);
    expect(summary.remaining.kcal).toBeCloseTo(summary.targets.kcal - 570.5, 6);
    expect(summary.loggedMeals).toBe(1);
  });

  it('household measures convert (concha de feijão = 86 g, 2 ovos = 100 g) and unknown units ask for grams', async () => {
    const u = await onboardedUser(ctx.app, today);
    const parse = await u.call({
      method: 'POST',
      url: '/api/v1/nutrition/parse',
      payload: { text: '1 concha de feijão, 2 ovos e 1 xícara de brócolis' },
    });
    const items = parse.json<{ items: ParsedItem[] }>().items;
    expect(items[0]).toMatchObject({ grams: 86, error: null });
    expect(items[1]).toMatchObject({ grams: 100, error: null });
    // Xícara usa a medida genérica (240 g)
    expect(items[2]?.grams).toBe(240);

    const pao = await u.call({
      method: 'POST',
      url: '/api/v1/nutrition/parse',
      payload: { text: '1 concha de arroz' },
    });
    expect(pao.json<{ items: ParsedItem[] }>().items[0]).toMatchObject({
      error: 'UNIT_NOT_CONVERTIBLE',
      grams: null,
    });

    // Sem conversão: o usuário informa os gramas uma vez e a medida é salva para ele.
    const riceId = pao.json<{ items: ParsedItem[] }>().items[0]?.match?.id ?? '';
    const noGrams = await u.call({
      method: 'POST',
      url: '/api/v1/meals',
      payload: {
        date: today,
        slot: 'dinner',
        items: [{ foodId: riceId, quantity: 1, unit: 'ladle' }],
      },
    });
    expect(noGrams.statusCode).toBe(422);
    expect(noGrams.json()).toMatchObject({ code: 'UNIT_NOT_CONVERTIBLE' });
    const withGrams = await u.call({
      method: 'POST',
      url: '/api/v1/meals',
      payload: {
        date: today,
        slot: 'dinner',
        items: [{ foodId: riceId, quantity: 1, unit: 'ladle', grams: 120 }],
      },
    });
    expect(withGrams.statusCode).toBe(201);
    const again = await u.call({
      method: 'POST',
      url: '/api/v1/nutrition/parse',
      payload: { text: '2 conchas de arroz' },
    });
    expect(again.json<{ items: ParsedItem[] }>().items[0]).toMatchObject({
      grams: 240,
      error: null,
    });
  });

  it('learns: usage ranks, and correcting a match creates a personal alias', async () => {
    const u = await onboardedUser(ctx.app, today);
    const search = async (q: string) =>
      (
        await u.call({ method: 'GET', url: `/api/v1/foods/search?q=${encodeURIComponent(q)}` })
      ).json<{
        items: { id: string; namePt: string }[];
      }>().items;
    const integral = (await search('arroz integral'))[0];
    const white = (await search('arroz'))[0];
    expect(integral?.namePt).toBe('Arroz, integral, cozido');
    await u.call({
      method: 'POST',
      url: '/api/v1/meals',
      payload: {
        date: today,
        slot: 'lunch',
        sourceText: '100g de arroz',
        items: [
          {
            foodId: integral?.id,
            quantity: 100,
            unit: 'g',
            query: 'arroz',
            suggestedFoodId: white?.id,
          },
        ],
      },
    });
    const parsed = (
      await u.call({
        method: 'POST',
        url: '/api/v1/nutrition/parse',
        payload: { text: '100g de arroz' },
      })
    ).json<{ items: ParsedItem[] }>();
    expect(parsed.items[0]?.match?.namePt).toBe('Arroz, integral, cozido');
  });

  it('saves a personal measure only when the unit would not convert, and only after the meal is saved', async () => {
    const u = await onboardedUser(ctx.app, today);
    const search = async (q: string) =>
      (
        await u.call({ method: 'GET', url: `/api/v1/foods/search?q=${encodeURIComponent(q)}` })
      ).json<{
        items: { id: string; measures: { unitCode: string; scope: string; grams: number }[] }[];
      }>().items[0];
    const beans = await search('feijao');
    // Concha já converte (86 g): gramas informados não viram medida pessoal.
    await u.call({
      method: 'POST',
      url: '/api/v1/meals',
      payload: {
        date: today,
        slot: 'lunch',
        items: [{ foodId: beans?.id, quantity: 1, unit: 'ladle', grams: 120 }],
      },
    });
    expect((await search('feijao'))?.measures.filter((m) => m.scope === 'user')).toEqual([]);

    // Um item inválido depois impede a gravação de medidas do item anterior.
    const rice = await search('arroz');
    const failed = await u.call({
      method: 'POST',
      url: '/api/v1/meals',
      payload: {
        date: today,
        slot: 'lunch',
        items: [
          { foodId: rice?.id, quantity: 1, unit: 'ladle', grams: 130 },
          { foodId: rice?.id, quantity: 1, unit: 'can' },
        ],
      },
    });
    expect(failed.statusCode).toBe(422);
    expect((await search('arroz'))?.measures.filter((m) => m.scope === 'user')).toEqual([]);
  });

  it('picking a food for an unmatched term teaches a personal alias', async () => {
    const u = await onboardedUser(ctx.app, today);
    const kiwi = (await u.call({ method: 'GET', url: '/api/v1/foods/search?q=kiwi' })).json<{
      items: { id: string }[];
    }>().items[0];
    await u.call({
      method: 'POST',
      url: '/api/v1/meals',
      payload: {
        date: today,
        slot: 'lunch',
        sourceText: '1 fruta verde peluda',
        items: [
          {
            foodId: kiwi?.id,
            quantity: 76,
            unit: 'g',
            query: 'fruta verde peluda',
            suggestedFoodId: null,
          },
        ],
      },
    });
    const parsed = (
      await u.call({
        method: 'POST',
        url: '/api/v1/nutrition/parse',
        payload: { text: '100g de fruta verde peluda' },
      })
    ).json<{ items: ParsedItem[] }>();
    expect(parsed.items[0]?.match?.id).toBe(kiwi?.id);
  });

  it('lists, patches meals and items (snapshot recomputed), deletes items; 404s and validation', async () => {
    const u = await onboardedUser(ctx.app, today);
    const rice = (await u.call({ method: 'GET', url: '/api/v1/foods/search?q=arroz' })).json<{
      items: { id: string }[];
    }>().items[0];
    const created = (
      await u.call({
        method: 'POST',
        url: '/api/v1/meals',
        payload: {
          date: today,
          slot: 'breakfast',
          items: [{ foodId: rice?.id, quantity: 100, unit: 'g' }],
        },
      })
    ).json<{ id: string; items: { id: string }[] }>();

    const list = (await u.call({ method: 'GET', url: `/api/v1/meals?date=${today}` })).json<{
      items: { id: string }[];
    }>();
    expect(list.items.map((m) => m.id)).toContain(created.id);
    expect(
      (await u.call({ method: 'GET', url: `/api/v1/meals?date=${addDays(today, -1)}` })).json(),
    ).toEqual({ items: [] });

    const moved = await u.call({
      method: 'PATCH',
      url: `/api/v1/meals/${created.id}`,
      payload: { slot: 'lunch' },
    });
    expect(moved.json()).toMatchObject({ slot: 'lunch' });

    const itemId = created.items[0]?.id ?? '';
    const patched = await u.call({
      method: 'PATCH',
      url: `/api/v1/meal-items/${itemId}`,
      payload: { quantity: 50 },
    });
    expect(
      patched.json<{ items: { grams: number; nutrients: { kcal: number } }[] }>().items[0],
    ).toMatchObject({
      grams: 50,
      nutrients: { kcal: 64 },
    });

    const added = await u.call({
      method: 'POST',
      url: `/api/v1/meals/${created.id}/items`,
      payload: { items: [{ foodId: rice?.id, quantity: 2, unit: 'tbsp' }] },
    });
    expect(added.json<{ items: unknown[]; totals: { kcal: number } }>().items).toHaveLength(2);
    expect(added.json<{ totals: { kcal: number } }>().totals.kcal).toBeCloseTo(128, 6);

    expect(
      (await u.call({ method: 'DELETE', url: `/api/v1/meal-items/${itemId}` })).statusCode,
    ).toBe(204);
    expect(
      (await u.call({ method: 'DELETE', url: `/api/v1/meal-items/${itemId}` })).statusCode,
    ).toBe(404);
    expect(
      (
        await u.call({
          method: 'PATCH',
          url: `/api/v1/meals/${MISSING}`,
          payload: { slot: 'lunch' },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await u.call({
          method: 'POST',
          url: '/api/v1/meals',
          payload: { date: today, slot: 'lunch', items: [] },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await u.call({
          method: 'POST',
          url: '/api/v1/meals',
          payload: {
            date: today,
            slot: 'lunch',
            items: [{ foodId: rice?.id, quantity: 6000, unit: 'g' }],
          },
        })
      ).statusCode,
    ).toBe(400);
  });

  it('logs water and reflects it in the day summary', async () => {
    const u = await onboardedUser(ctx.app, today);
    for (const ml of [250, 500]) {
      const res = await u.call({
        method: 'POST',
        url: '/api/v1/water-logs',
        payload: { date: today, ml },
      });
      expect(res.statusCode).toBe(201);
    }
    const s = (
      await u.call({ method: 'GET', url: `/api/v1/nutrition/day-summary?date=${today}` })
    ).json<{
      waterMl: number;
      consumed: { waterMl: number };
    }>();
    expect(s.waterMl).toBe(750);
    expect(
      (await u.call({ method: 'POST', url: '/api/v1/water-logs', payload: { date: today, ml: 0 } }))
        .statusCode,
    ).toBe(400);
  });

  it('isolates meals, items and water between users', async () => {
    const a = await onboardedUser(ctx.app, today);
    const rice = (await a.call({ method: 'GET', url: '/api/v1/foods/search?q=arroz' })).json<{
      items: { id: string }[];
    }>().items[0];
    const meal = (
      await a.call({
        method: 'POST',
        url: '/api/v1/meals',
        payload: {
          date: today,
          slot: 'lunch',
          items: [{ foodId: rice?.id, quantity: 100, unit: 'g' }],
        },
      })
    ).json<{ id: string; items: { id: string }[] }>();
    await a.call({ method: 'POST', url: '/api/v1/water-logs', payload: { date: today, ml: 300 } });

    const b = await registerUser(ctx.app);
    const callB = as(ctx.app, b.cookie);
    expect((await callB({ method: 'GET', url: `/api/v1/meals?date=${today}` })).json()).toEqual({
      items: [],
    });
    expect(
      (
        await callB({
          method: 'PATCH',
          url: `/api/v1/meals/${meal.id}`,
          payload: { slot: 'dinner' },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await callB({
          method: 'POST',
          url: `/api/v1/meals/${meal.id}/items`,
          payload: { items: [{ foodId: rice?.id, quantity: 1, unit: 'g' }] },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await callB({
          method: 'PATCH',
          url: `/api/v1/meal-items/${meal.items[0]?.id ?? ''}`,
          payload: { quantity: 1 },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await callB({ method: 'DELETE', url: `/api/v1/meal-items/${meal.items[0]?.id ?? ''}` }))
        .statusCode,
    ).toBe(404);
    const s = (
      await callB({ method: 'GET', url: `/api/v1/nutrition/day-summary?date=${today}` })
    ).json<{
      waterMl: number;
      consumed: { kcal: number };
    }>();
    expect(s.waterMl).toBe(0);
    expect(s.consumed.kcal).toBe(0);
  });

  it('rate-limits the AI parse endpoint per user', async () => {
    const limited = await createTestApp({ aiRateLimitMax: 2 });
    try {
      const u = await registerUser(limited.app);
      const call = as(limited.app, u.cookie);
      const statuses: number[] = [];
      for (let i = 0; i < 3; i++) {
        statuses.push(
          (
            await call({
              method: 'POST',
              url: '/api/v1/nutrition/parse',
              payload: { text: '1 ovo' },
            })
          ).statusCode,
        );
      }
      expect(statuses).toEqual([200, 200, 429]);
    } finally {
      await limited.close();
    }
  });
});
