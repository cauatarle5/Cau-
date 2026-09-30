import { KCAL_PER_G, type PrimaryGoal, type Sex } from './types';

export const PROTEIN_G_PER_KG_DEFAULT = 1.8;
/** fat_loss e recomposition: 2,0–2,2 g/kg; usa-se 2,2 (ADR-021). */
export const PROTEIN_G_PER_KG_DEFICIT = 2.2;
export const PROTEIN_G_PER_KG_LEAN = 2.4;
export const HIGH_BODY_FAT_PCT: Record<Sex, number> = { male: 25, female: 32 };

export interface ProteinResult {
  grams: number;
  gPerKg: number;
  basis: 'total_weight' | 'lean_mass' | 'user_override';
}

/** Proteína (PROMPT_MESTRE 5.6): constante entre tipos de dia. */
export function proteinTarget(params: {
  goal: PrimaryGoal;
  sex: Sex;
  weightKg: number;
  bodyFatPct?: number | null;
  proteinGPerKgOverride?: number | null;
}): ProteinResult {
  const { goal, sex, weightKg, bodyFatPct, proteinGPerKgOverride } = params;
  if (proteinGPerKgOverride) {
    return {
      grams: proteinGPerKgOverride * weightKg,
      gPerKg: proteinGPerKgOverride,
      basis: 'user_override',
    };
  }
  if (bodyFatPct !== undefined && bodyFatPct !== null && bodyFatPct > HIGH_BODY_FAT_PCT[sex]) {
    const lean = weightKg * (1 - bodyFatPct / 100);
    return {
      grams: PROTEIN_G_PER_KG_LEAN * lean,
      gPerKg: PROTEIN_G_PER_KG_LEAN,
      basis: 'lean_mass',
    };
  }
  const gPerKg =
    goal === 'fat_loss' || goal === 'recomposition'
      ? PROTEIN_G_PER_KG_DEFICIT
      : PROTEIN_G_PER_KG_DEFAULT;
  return { grams: gPerKg * weightKg, gPerKg, basis: 'total_weight' };
}

export const FAT_G_PER_KG = 0.8;
export const FAT_MIN_G_PER_KG = 0.6;
export const FAT_MIN_KCAL_SHARE = 0.2;

/** Gordura: 0,8 g/kg com piso de 20% das kcal. */
export function fatTarget(weightKg: number, kcal: number): number {
  return Math.max(FAT_G_PER_KG * weightKg, (FAT_MIN_KCAL_SHARE * kcal) / KCAL_PER_G.fat);
}

/** Fibra: 14 g por 1000 kcal, mínimo 25 g. */
export function fiberTarget(kcal: number): number {
  return Math.max(25, (14 * kcal) / 1000);
}

/** Água: 35 ml/kg + 500 ml por hora de exercício. */
export function waterTarget(weightKg: number, exerciseHoursPerDay: number): number {
  return 35 * weightKg + 500 * exerciseHoursPerDay;
}

/**
 * Carboidrato = restante. Com piso de carboidrato (dias de treino pesado/esporte),
 * reduz a gordura até 0,6 g/kg antes de violar o piso.
 */
export function carbsAndFat(params: {
  kcal: number;
  proteinG: number;
  fatG: number;
  weightKg: number;
  carbFloorGPerKg?: number;
}): { carbsG: number; fatG: number } {
  const { kcal, proteinG, weightKg, carbFloorGPerKg } = params;
  let fatG = params.fatG;
  const carbsFor = (fat: number) =>
    (kcal - proteinG * KCAL_PER_G.protein - fat * KCAL_PER_G.fat) / KCAL_PER_G.carbs;
  let carbsG = carbsFor(fatG);
  if (carbFloorGPerKg !== undefined) {
    const floor = carbFloorGPerKg * weightKg;
    if (carbsG < floor) {
      const minFat = FAT_MIN_G_PER_KG * weightKg;
      const fatNeeded =
        (kcal - proteinG * KCAL_PER_G.protein - floor * KCAL_PER_G.carbs) / KCAL_PER_G.fat;
      fatG = Math.max(minFat, Math.min(fatG, fatNeeded));
      carbsG = carbsFor(fatG);
    }
  }
  return { carbsG: Math.max(0, carbsG), fatG };
}
