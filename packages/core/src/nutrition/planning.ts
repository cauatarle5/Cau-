import type { FoodCategory } from '../food/match';
import { scaleNutrients, sumNutrients, type Nutrients } from '../food/nutrients';

export interface PlanTotals {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface PlannedItemLike {
  id: string;
  foodName: string;
  nutrients: Nutrients;
}

export type OverNutrient = 'kcal' | 'fatG' | 'carbsG';

export type PlanningAlert =
  | {
      kind: 'over';
      nutrient: OverNutrient;
      forecast: number;
      target: number;
      excess: number;
      /** Item planejado que mais contribui para o excesso (nulo se só há consumido). */
      itemId: string | null;
    }
  | {
      kind: 'low';
      nutrient: 'proteinG' | 'fiberG';
      forecast: number;
      target: number;
      missing: number;
    };

/** Limiares da P7.3: excesso > 10%; proteína < 85%; fibra < 70%. */
export const PLANNING_THRESHOLDS = { over: 1.1, proteinMin: 0.85, fiberMin: 0.7 } as const;

const OVER: readonly OverNutrient[] = ['fatG', 'kcal', 'carbsG'];

/** Previsto = consumido + planejado, por nutriente das metas. */
export function forecastTotals(consumed: PlanTotals, planned: readonly Nutrients[]): PlanTotals {
  const p = sumNutrients(planned);
  return {
    kcal: consumed.kcal + (p.kcal ?? 0),
    proteinG: consumed.proteinG + (p.proteinG ?? 0),
    carbsG: consumed.carbsG + (p.carbsG ?? 0),
    fatG: consumed.fatG + (p.fatG ?? 0),
    fiberG: consumed.fiberG + (p.fiberG ?? 0),
  };
}

/** Alertas do planejamento do dia (P7.3), calculados no cliente e na API. */
export function planningAlerts(
  targets: PlanTotals,
  consumed: PlanTotals,
  planned: readonly PlannedItemLike[],
): PlanningAlert[] {
  const forecast = forecastTotals(
    consumed,
    planned.map((i) => i.nutrients),
  );
  const alerts: PlanningAlert[] = [];
  for (const nutrient of OVER) {
    const target = targets[nutrient];
    if (target > 0 && forecast[nutrient] > target * PLANNING_THRESHOLDS.over) {
      let itemId: string | null = null;
      let best = 0;
      for (const item of planned) {
        const v = item.nutrients[nutrient] ?? 0;
        if (v > best) {
          best = v;
          itemId = item.id;
        }
      }
      alerts.push({
        kind: 'over',
        nutrient,
        forecast: forecast[nutrient],
        target,
        excess: forecast[nutrient] - target,
        itemId,
      });
    }
  }
  const low = [
    ['proteinG', PLANNING_THRESHOLDS.proteinMin],
    ['fiberG', PLANNING_THRESHOLDS.fiberMin],
  ] as const;
  for (const [nutrient, pct] of low) {
    const target = targets[nutrient];
    if (target > 0 && forecast[nutrient] < target * pct) {
      alerts.push({
        kind: 'low',
        nutrient,
        forecast: forecast[nutrient],
        target,
        missing: target - forecast[nutrient],
      });
    }
  }
  return alerts;
}

export interface SubstitutionFood {
  id: string;
  name: string;
  category: FoodCategory;
  per100: Nutrients;
  /** O usuário já comeu (desempate a favor). */
  fromHistory?: boolean;
}

export interface SubstitutionOption {
  food: SubstitutionFood;
  grams: number;
  nutrients: Nutrients;
  /** Quanto o nutriente excedente cai em relação ao item original. */
  reduction: number;
}

const ceilTo = (v: number, step: number) => Math.ceil(v / step - 1e-9) * step;

/**
 * Motor de substituição (P7.3, ADR-040): mesma categoria; mantém a gramagem ou aumenta até
 * proteína ≥ 90% da original (múltiplos de 5 g); kcal até +15% da original; precisa reduzir
 * o nutriente excedente. Ordena pela redução, histórico do usuário primeiro no empate.
 */
export function findSubstitutions(
  original: { food: SubstitutionFood; grams: number },
  nutrient: OverNutrient,
  candidates: readonly SubstitutionFood[],
  limit = 3,
): SubstitutionOption[] {
  const orig = scaleNutrients(original.food.per100, original.grams);
  const origKcal = orig.kcal ?? 0;
  const origProtein = orig.proteinG ?? 0;
  const origValue = orig[nutrient] ?? 0;
  const out: SubstitutionOption[] = [];
  for (const food of candidates) {
    if (food.id === original.food.id || food.category !== original.food.category) continue;
    const p100 = food.per100.proteinG;
    if (food.per100.kcal === null || food.per100[nutrient] === null || p100 === null) continue;
    let grams = original.grams;
    if ((p100 * grams) / 100 < origProtein * 0.9) {
      if (p100 <= 0) continue;
      grams = ceilTo((origProtein * 0.9 * 100) / p100, 5);
    }
    const nutrients = scaleNutrients(food.per100, grams);
    if ((nutrients.kcal ?? 0) > origKcal * 1.15) continue;
    const reduction = origValue - (nutrients[nutrient] ?? 0);
    if (reduction <= 0) continue;
    out.push({ food, grams, nutrients, reduction });
  }
  return out
    .sort(
      (a, b) =>
        b.reduction - a.reduction ||
        Number(b.food.fromHistory ?? false) - Number(a.food.fromHistory ?? false) ||
        a.food.name.localeCompare(b.food.name),
    )
    .slice(0, limit);
}
