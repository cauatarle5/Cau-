import { scaleNutrients, type Nutrients } from './nutrients';
import { toGrams, type FoodForConversion, type FoodUnit, type MeasureOption } from './units';

export type PortionResult =
  | { ok: true; grams: number; densityAssumed: boolean; nutrients: Nutrients }
  | { ok: false; code: 'UNIT_NOT_CONVERTIBLE' };

/**
 * Porção de um alimento: gramas (P6.2 passo 5) e nutrientes (passo 6). Usado pela API
 * para o snapshot oficial e pelo front para os totais em tempo real.
 */
export function computePortion(
  food: FoodForConversion & { per100: Nutrients },
  measures: readonly MeasureOption[],
  quantity: number,
  unit: FoodUnit | null,
  gramsOverride?: number | null,
): PortionResult {
  if (gramsOverride && gramsOverride > 0) {
    return {
      ok: true,
      grams: gramsOverride,
      densityAssumed: false,
      nutrients: scaleNutrients(food.per100, gramsOverride),
    };
  }
  const r = toGrams(quantity, unit, food, measures);
  if (!r.ok) return r;
  return {
    ok: true,
    grams: r.grams,
    densityAssumed: r.densityAssumed,
    nutrients: scaleNutrients(food.per100, r.grams),
  };
}
