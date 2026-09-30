/** Unidades internas de medida caseira (DATA_MODEL 4.5). */
export const HOUSEHOLD_UNITS = [
  'unit',
  'slice',
  'tbsp',
  'tsp',
  'cup',
  'scoop',
  'ladle',
  'portion',
  'pinch',
  'glass',
  'can',
  'small',
  'medium',
  'large',
] as const;
export type HouseholdUnit = (typeof HOUSEHOLD_UNITS)[number];
export type MassUnit = 'g' | 'kg' | 'ml' | 'l';
export type FoodUnit = MassUnit | HouseholdUnit;

export interface MeasureOption {
  unitCode: HouseholdUnit;
  grams: number;
  isDefault: boolean;
  /** Ordem de busca: do alimento, do usuário, genérica (P6.2, passo 5). */
  scope: 'food' | 'user' | 'generic';
}

export interface FoodForConversion {
  defaultUnit: 'g' | 'ml';
  densityGPerMl: number | null;
}

export type GramsResult =
  | { ok: true; grams: number; densityAssumed: boolean; measure: MeasureOption | null }
  | { ok: false; code: 'UNIT_NOT_CONVERTIBLE' };

const SCOPE_ORDER: Record<MeasureOption['scope'], number> = { food: 0, user: 1, generic: 2 };

/**
 * Converte quantidade + unidade em gramas. `unit = null` significa "uma unidade"
 * (medida `is_default` do alimento). Sem conversão possível: UNIT_NOT_CONVERTIBLE.
 */
export function toGrams(
  quantity: number,
  unit: FoodUnit | null,
  food: FoodForConversion,
  measures: readonly MeasureOption[],
): GramsResult {
  if (!(quantity > 0)) return { ok: false, code: 'UNIT_NOT_CONVERTIBLE' };
  switch (unit) {
    case 'g':
      return { ok: true, grams: quantity, densityAssumed: false, measure: null };
    case 'kg':
      return { ok: true, grams: quantity * 1000, densityAssumed: false, measure: null };
    case 'ml':
    case 'l': {
      const ml = unit === 'l' ? quantity * 1000 : quantity;
      const density = food.densityGPerMl;
      return {
        ok: true,
        grams: ml * (density ?? 1),
        densityAssumed: density === null,
        measure: null,
      };
    }
    default: {
      const sorted = [...measures].sort((a, b) => SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope]);
      const wanted = unit ?? 'unit';
      let measure = sorted.find((m) => m.unitCode === wanted);
      // "unidade" sem tamanho usa a medida padrão (normalmente média).
      if (!measure && (wanted === 'unit' || unit === null)) {
        measure =
          sorted.find((m) => m.isDefault && m.scope !== 'generic') ??
          sorted.find((m) => m.unitCode === 'medium' && m.scope !== 'generic');
      }
      if (!measure) return { ok: false, code: 'UNIT_NOT_CONVERTIBLE' };
      return { ok: true, grams: quantity * measure.grams, densityAssumed: false, measure };
    }
  }
}
