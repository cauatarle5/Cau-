import { describe, expect, it } from 'vitest';

import { confidenceBand, matchScore, usageScore } from './match';
import { emptyNutrients, scaleNutrients, sumNutrients, type Nutrients } from './nutrients';
import { toGrams, type MeasureOption } from './units';

const solid = { defaultUnit: 'g' as const, densityGPerMl: null };

describe('toGrams (P6.2 step 5)', () => {
  const measures: MeasureOption[] = [
    { unitCode: 'tbsp', grams: 15, isDefault: false, scope: 'generic' },
    { unitCode: 'tbsp', grams: 25, isDefault: false, scope: 'food' },
    { unitCode: 'unit', grams: 50, isDefault: true, scope: 'food' },
    { unitCode: 'ladle', grams: 90, isDefault: false, scope: 'user' },
  ];

  it('g and kg are direct', () => {
    expect(toGrams(200, 'g', solid, [])).toMatchObject({ ok: true, grams: 200 });
    expect(toGrams(1.5, 'kg', solid, [])).toMatchObject({ ok: true, grams: 1500 });
  });

  it('ml uses the food density, defaulting to 1.0 flagged', () => {
    expect(toGrams(200, 'ml', { defaultUnit: 'ml', densityGPerMl: 1.03 }, [])).toMatchObject({
      ok: true,
      grams: expect.closeTo(206, 6) as number,
      densityAssumed: false,
    });
    expect(toGrams(1, 'l', { defaultUnit: 'ml', densityGPerMl: null }, [])).toMatchObject({
      grams: 1000,
      densityAssumed: true,
    });
  });

  it('household measures: food first, then user, then generic', () => {
    expect(toGrams(2, 'tbsp', solid, measures)).toMatchObject({ grams: 50 }); // alimento (25 g)
    expect(toGrams(1, 'ladle', solid, measures)).toMatchObject({ grams: 90 }); // usuário
    expect(
      toGrams(
        2,
        'tbsp',
        solid,
        measures.filter((m) => m.scope === 'generic'),
      ),
    ).toMatchObject({ grams: 30 });
  });

  it('"unit" without size uses the default measure', () => {
    expect(toGrams(2, null, solid, measures)).toMatchObject({ ok: true, grams: 100 });
    expect(toGrams(1, 'unit', solid, measures)).toMatchObject({ ok: true, grams: 50 });
  });

  it('returns UNIT_NOT_CONVERTIBLE when nothing matches', () => {
    expect(toGrams(1, 'cup', solid, measures)).toEqual({ ok: false, code: 'UNIT_NOT_CONVERTIBLE' });
    expect(toGrams(1, null, solid, [])).toEqual({ ok: false, code: 'UNIT_NOT_CONVERTIBLE' });
    expect(toGrams(0, 'g', solid, [])).toEqual({ ok: false, code: 'UNIT_NOT_CONVERTIBLE' });
  });
});

describe('nutrients (P6.2 step 6)', () => {
  // Arroz tipo 1 cozido (TACO): 128 kcal, 2,5 P, 28,1 C, 0,2 G por 100 g
  const rice: Nutrients = {
    ...emptyNutrients(),
    kcal: 128,
    proteinG: 2.5,
    carbsG: 28.1,
    fatG: 0.2,
    fiberG: 1.6,
  };

  it('scales per-100 values and keeps nulls', () => {
    const s = scaleNutrients(rice, 200);
    expect(s).toMatchObject({
      kcal: 256,
      proteinG: 5,
      carbsG: expect.closeTo(56.2, 6) as number,
      sodiumMg: null,
    });
  });

  it('sums snapshots; null only when absent everywhere', () => {
    const chicken: Nutrients = {
      ...emptyNutrients(),
      kcal: 238.5,
      proteinG: 48,
      fatG: 3.75,
      carbsG: 0,
    };
    const total = sumNutrients([scaleNutrients(rice, 200), chicken]);
    expect(total.kcal).toBeCloseTo(494.5, 6);
    expect(total.fiberG).toBeCloseTo(3.2, 6);
    expect(total.sodiumMg).toBeNull();
  });
});

describe('matching (P6.2 step 4)', () => {
  const base = {
    similarity: 1,
    timesUsed: 0,
    verified: true,
    category: 'cereals' as const,
    state: 'cooked' as const,
  };

  it('score = 0.6 similarity + 0.3 usage + 0.1 verified', () => {
    expect(matchScore('arroz', base)).toBeCloseTo(0.7, 6);
    expect(matchScore('arroz', { ...base, timesUsed: 10 })).toBeCloseTo(1, 6);
    expect(matchScore('arroz', { ...base, similarity: 0.5, verified: false })).toBeCloseTo(0.3, 6);
    expect(usageScore(5)).toBe(0.5);
  });

  it('raw items of cooked-by-default categories are penalized unless "cru" is said', () => {
    const raw = { ...base, state: 'raw' as const };
    expect(matchScore('arroz', raw)).toBeCloseTo(0.58, 6);
    expect(matchScore('arroz cru', raw)).toBeCloseTo(0.7, 6);
    expect(matchScore('banana', { ...raw, category: 'fruits' })).toBeCloseTo(0.7, 6);
  });

  it('an exact curated alias reaches "auto" on first use (ADR-032)', () => {
    expect(matchScore('arroz', { ...base, exactAlias: true })).toBeCloseTo(1, 6);
    expect(confidenceBand(matchScore('arroz', { ...base, exactAlias: true }))).toBe('auto');
    expect(confidenceBand(matchScore('arroz', base))).toBe('review');
  });

  it('confidence bands 0.75 / 0.45', () => {
    expect(confidenceBand(0.8)).toBe('auto');
    expect(confidenceBand(0.75)).toBe('auto');
    expect(confidenceBand(0.6)).toBe('review');
    expect(confidenceBand(0.44)).toBe('choose');
  });
});

describe('computePortion and suggestSlot', () => {
  it('computes grams and nutrients, with a grams override', async () => {
    const { computePortion } = await import('./portion');
    const food = {
      defaultUnit: 'g' as const,
      densityGPerMl: null,
      per100: { ...emptyNutrients(), kcal: 76, proteinG: 4.8 },
    };
    const ladle: MeasureOption[] = [
      { unitCode: 'ladle', grams: 86, isDefault: false, scope: 'food' },
    ];
    expect(computePortion(food, ladle, 1, 'ladle')).toMatchObject({
      ok: true,
      grams: 86,
      nutrients: { kcal: expect.closeTo(65.36, 6) as number },
    });
    expect(computePortion(food, [], 1, 'ladle')).toEqual({
      ok: false,
      code: 'UNIT_NOT_CONVERTIBLE',
    });
    expect(computePortion(food, [], 1, 'ladle', 120)).toMatchObject({ ok: true, grams: 120 });
  });

  it.each([
    [7, 'breakfast'],
    [11, 'morning_snack'],
    [13, 'lunch'],
    [16, 'afternoon_snack'],
    [20, 'dinner'],
    [23, 'supper'],
    [2, 'supper'],
  ])('hour %d → %s', async (hour, slot) => {
    const { suggestSlot } = await import('./slot');
    expect(suggestSlot(hour)).toBe(slot);
  });
});
