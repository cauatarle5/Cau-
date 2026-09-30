import type { Sex } from './types';

export type SafetyLock = 'MAX_DEFICIT' | 'MIN_BMR' | 'MIN_ABSOLUTE';

export const MAX_DEFICIT_PCT = 0.25;
export const MIN_KCAL: Record<Sex, number> = { male: 1500, female: 1200 };

/**
 * Travas não negociáveis (PROMPT_MESTRE 5.7): déficit ≤ 25% do GET,
 * kcal ≥ TMB e ≥ 1500 (H) / 1200 (M). Retorna as travas aplicadas.
 */
export function applySafetyLocks(params: {
  kcal: number;
  tdeeKcal: number;
  bmrKcal: number;
  sex: Sex;
}): {
  kcal: number;
  applied: SafetyLock[];
} {
  const applied: SafetyLock[] = [];
  let kcal = params.kcal;
  const deficitFloor = params.tdeeKcal * (1 - MAX_DEFICIT_PCT);
  if (kcal < deficitFloor) {
    kcal = deficitFloor;
    applied.push('MAX_DEFICIT');
  }
  if (kcal < params.bmrKcal) {
    kcal = params.bmrKcal;
    applied.push('MIN_BMR');
  }
  if (kcal < MIN_KCAL[params.sex]) {
    kcal = MIN_KCAL[params.sex];
    applied.push('MIN_ABSOLUTE');
  }
  return { kcal, applied };
}
