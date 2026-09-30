import type { BodyFatMethod, Sex } from './types';

export interface BmrInput {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  ageYears: number;
  bodyFat?: { pct: number; method: BodyFatMethod; daysAgo: number } | null;
}

export interface BmrResult {
  kcal: number;
  method: 'mifflin_st_jeor' | 'katch_mcardle';
  leanMassKg: number | null;
}

/** Mifflin-St Jeor (PROMPT_MESTRE 5.1). */
export function mifflinStJeor({
  sex,
  weightKg,
  heightCm,
  ageYears,
}: Omit<BmrInput, 'bodyFat'>): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + (sex === 'male' ? 5 : -161);
}

/** Katch-McArdle: 370 + 21,6 × massa magra. */
export function katchMcArdle(leanMassKg: number): number {
  return 370 + 21.6 * leanMassKg;
}

const MEASURED_METHODS: readonly BodyFatMethod[] = ['dexa', 'skinfold', 'bioimpedance'];
export const BODY_FAT_MAX_AGE_DAYS = 60;

/** Gordura corporal medida (não visual) nos últimos 60 dias habilita Katch-McArdle. */
export function isMeasuredBodyFat(bodyFat: BmrInput['bodyFat']): boolean {
  return (
    !!bodyFat &&
    MEASURED_METHODS.includes(bodyFat.method) &&
    bodyFat.daysAgo >= 0 &&
    bodyFat.daysAgo <= BODY_FAT_MAX_AGE_DAYS
  );
}

export function selectBmr(input: BmrInput): BmrResult {
  if (input.bodyFat && isMeasuredBodyFat(input.bodyFat)) {
    const leanMassKg = input.weightKg * (1 - input.bodyFat.pct / 100);
    return { kcal: katchMcArdle(leanMassKg), method: 'katch_mcardle', leanMassKg };
  }
  return { kcal: mifflinStJeor(input), method: 'mifflin_st_jeor', leanMassKg: null };
}
