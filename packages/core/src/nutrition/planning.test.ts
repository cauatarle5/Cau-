import { describe, expect, it } from 'vitest';

import { emptyNutrients, type Nutrients } from '../food/nutrients';
import { recipeNutrition } from '../food/recipe';

import { findSubstitutions, planningAlerts, type SubstitutionFood } from './planning';
import { suggestMeal, type SuggestPoolItem } from './suggest';

const n = (v: Partial<Nutrients>): Nutrients => ({ ...emptyNutrients(), ...v });

describe('recipeNutrition (P7.1)', () => {
  const ingredients = [
    { grams: 200, nutrients: n({ kcal: 300, proteinG: 60, fatG: 6 }) },
    { grams: 100, nutrients: n({ kcal: 200, proteinG: 2, fatG: 20 }) },
  ];

  it('total, per serving and per 100 g of the raw weight', () => {
    const r = recipeNutrition(ingredients, 2);
    expect(r.total.kcal).toBe(500);
    expect(r.perServing).toMatchObject({ kcal: 250, proteinG: 31, fatG: 13 });
    expect(r.totalGrams).toBe(300);
    expect(r.servingGrams).toBe(150);
    // 500 × 100 / 300 = 166,67
    expect(r.per100.kcal).toBeCloseTo(166.667, 3);
    expect(r.per100.carbsG).toBeNull();
    expect(r.cookedBasis).toBe(false);
  });

  it('per 100 g of the cooked weight when informed', () => {
    const r = recipeNutrition(ingredients, 2, 250);
    // 500 × 100 / 250 = 200 kcal; 62 × 100 / 250 = 24,8 g
    expect(r.per100.kcal).toBeCloseTo(200, 6);
    expect(r.per100.proteinG).toBeCloseTo(24.8, 6);
    expect(r.servingGrams).toBe(125);
    expect(r.cookedBasis).toBe(true);
  });
});

describe('planningAlerts (P7.3)', () => {
  const targets = { kcal: 2000, proteinG: 150, carbsG: 200, fatG: 60, fiberG: 30 };
  const consumed = { kcal: 800, proteinG: 60, carbsG: 80, fatG: 20, fiberG: 10 };
  // TACO: muçarela 200 g e arroz cozido 100 g.
  const planned = [
    {
      id: 'mozz',
      foodName: 'Queijo, mozarela',
      nutrients: n({ kcal: 660, proteinG: 45.2, carbsG: 6, fatG: 50.4 }),
    },
    {
      id: 'rice',
      foodName: 'Arroz',
      nutrients: n({ kcal: 128, proteinG: 2.5, carbsG: 28.1, fatG: 0.2, fiberG: 1.6 }),
    },
  ];

  it('fat over 110% points to the planned item; low protein and fiber', () => {
    const alerts = planningAlerts(targets, consumed, planned);
    // Gordura prevista: 20 + 50,4 + 0,2 = 70,6 > 66 (60 × 1,1)
    const fat = alerts.find((a) => a.kind === 'over' && a.nutrient === 'fatG');
    expect(fat).toMatchObject({ kind: 'over', itemId: 'mozz', target: 60 });
    expect(fat?.kind === 'over' && fat.excess).toBeCloseTo(10.6, 6);
    // kcal 1588 e carboidrato 114,1 dentro da faixa.
    expect(alerts.filter((a) => a.kind === 'over')).toHaveLength(1);
    // Proteína 107,7 < 127,5 (85%); fibra 11,6 < 21 (70%).
    const protein = alerts.find((a) => a.nutrient === 'proteinG');
    expect(protein?.kind === 'low' && protein.missing).toBeCloseTo(42.3, 6);
    const fiber = alerts.find((a) => a.nutrient === 'fiberG');
    expect(fiber?.kind === 'low' && fiber.missing).toBeCloseTo(18.4, 6);
  });

  it('no alerts when the forecast is within the bands', () => {
    const ok = planningAlerts(
      targets,
      { kcal: 1900, proteinG: 140, carbsG: 190, fatG: 60, fiberG: 25 },
      [],
    );
    expect(ok).toEqual([]);
  });
});

describe('findSubstitutions (P7.3, ADR-040)', () => {
  const dairy = (
    id: string,
    name: string,
    kcal: number,
    proteinG: number,
    fatG: number,
  ): SubstitutionFood => ({
    id,
    name,
    category: 'dairy',
    per100: n({ kcal, proteinG, fatG }),
  });
  // TACO 4ª ed.
  const mozz = dairy('mozz', 'Queijo, mozarela', 330, 22.6, 25.2);
  const candidates = [
    dairy('ricota', 'Queijo, ricota', 140, 12.6, 8.1),
    dairy('minas', 'Queijo, minas, frescal', 264, 17.4, 20.2),
    dairy('parm', 'Queijo, parmesão', 453, 35.6, 33.5),
    dairy('prato', 'Queijo, prato', 360, 22.7, 29.1),
    { ...dairy('frango', 'Frango', 159, 32, 2.5), category: 'poultry' as const },
    // Reduz mais a gordura, mas é de outra família: vem depois dos queijos (ADR-041).
    dairy('po', 'Leite, de vaca, desnatado, pó', 362, 34.7, 0.9),
  ];

  it('keeps protein ≥ 90% (rounding up to 5 g), kcal ≤ +15% and ranks by fat reduction', () => {
    const options = findSubstitutions({ food: mozz, grams: 50 }, 'fatG', candidates);
    // Original 50 g: 165 kcal, 11,3 g proteína, 12,6 g gordura.
    // Ricota: 90% × 11,3 = 10,17 g → 80,7 g → 85 g: 10,71 P, 6,885 G → reduz 5,715 g.
    // Minas: → 58,4 g → 60 g: 10,44 P, 12,12 G → reduz 0,48 g.
    // Parmesão passa de +15% kcal (226,5 > 189,75); prato aumenta a gordura; frango é de outra categoria.
    // Leite em pó: 50 g já dá 17,35 P (≥ 90%), 181 kcal, 0,45 G: reduz 12,15 g, mas fica depois dos queijos.
    expect(options.map((o) => [o.food.id, o.grams])).toEqual([
      ['ricota', 85],
      ['minas', 60],
      ['po', 50],
    ]);
    expect(options[0]?.reduction).toBeCloseTo(5.715, 6);
    expect(options[0]?.nutrients.proteinG).toBeCloseTo(10.71, 6);
  });

  it('history breaks ties', () => {
    const a = dairy('a', 'A', 100, 10, 1);
    const b = { ...dairy('b', 'B', 100, 10, 1), fromHistory: true };
    expect(
      findSubstitutions({ food: mozz, grams: 50 }, 'fatG', [a, b]).map((o) => o.food.id),
    ).toEqual(['b', 'a']);
  });
});

describe('suggestMeal (P7.2, ADR-039)', () => {
  const chicken: SuggestPoolItem = {
    key: 'chicken',
    name: 'Frango grelhado',
    per100: { kcal: 159, proteinG: 32, carbsG: 0, fatG: 2.5 },
    step: 10,
    maxGrams: 300,
  };
  const rice: SuggestPoolItem = {
    key: 'rice',
    name: 'Arroz cozido',
    per100: { kcal: 128, proteinG: 2.5, carbsG: 28.1, fatG: 0.2 },
    step: 10,
    maxGrams: 400,
  };
  const oil: SuggestPoolItem = {
    key: 'oil',
    name: 'Azeite',
    per100: { kcal: 884, proteinG: 0, carbsG: 0, fatG: 100 },
    step: 5,
    maxGrams: 20,
  };
  const c = { kcal: 500, proteinMin: 40, carbsMax: 60, fatMax: 20 };

  it('single item: LP bound then practical rounding', () => {
    const [only] = suggestMeal([chicken], c);
    // kcal ≤ 500 → 314,5 g, limitado a 300 g: 477 kcal, 96 g proteína, 7,5 g gordura.
    expect(only?.items).toEqual([{ key: 'chicken', name: 'Frango grelhado', grams: 300 }]);
    expect(only?.totals.kcal).toBeCloseTo(477, 6);
    expect(only?.remaining.kcal).toBeCloseTo(23, 6);
  });

  it('top options respect every limit, use practical steps and are deterministic', () => {
    const options = suggestMeal([chicken, rice, oil], c);
    expect(options).toHaveLength(3);
    for (const o of options) {
      expect(o.totals.kcal).toBeLessThanOrEqual(500 + 1e-6);
      expect(o.totals.proteinG).toBeGreaterThanOrEqual(40 - 1e-6);
      expect(o.totals.carbsG).toBeLessThanOrEqual(60 + 1e-6);
      expect(o.totals.fatG).toBeLessThanOrEqual(20 + 1e-6);
      for (const i of o.items) {
        const step = i.key === 'oil' ? 5 : 10;
        expect(i.grams % step).toBe(0);
      }
    }
    // Ordenadas pelo kcal restante; a melhor chega perto de 500.
    expect(options[0]?.remaining.kcal).toBeLessThan(options[2]?.remaining.kcal ?? Infinity);
    expect(options[0]?.remaining.kcal).toBeLessThan(15);
    expect(suggestMeal([chicken, rice, oil], c)).toEqual(options);
  });

  it('returns nothing when infeasible or with no kcal left', () => {
    expect(suggestMeal([rice], { ...c, proteinMin: 40 })).toEqual([]);
    expect(suggestMeal([chicken], { ...c, kcal: 0 })).toEqual([]);
  });
});
