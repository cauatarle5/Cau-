import type { ActivityLifestyle, SportCode } from './types';

/** Fator de estilo de vida sem exercício (PROMPT_MESTRE 5.2). */
export const LIFESTYLE_FACTORS: Record<ActivityLifestyle, number> = {
  sedentary: 1.2,
  light: 1.35,
  moderate: 1.5,
  high: 1.65,
};

/** Tabela de MET padrão (PROMPT_MESTRE 5.2). */
export const MET = {
  strengthModerate: 3.5,
  strengthIntense: 5.0,
  footballRecreational: 7.0,
  footballCompetitive: 10.0,
  running: 8.0,
  cycling: 6.8,
  swimming: 5.8,
  walking: 3.5,
} as const;

/** kcal líquidas do exercício: (MET − 1) × peso × horas. */
export function netExerciseKcal(met: number, weightKg: number, minutes: number): number {
  return (met - 1) * weightKg * (minutes / 60);
}

/** MET de um esporte a partir da intensidade típica 1–5 (ADR-016). */
export function sportMet(sport: SportCode, typicalIntensity: number): number {
  switch (sport) {
    case 'football':
    case 'futsal':
      return typicalIntensity >= 4 ? MET.footballCompetitive : MET.footballRecreational;
    case 'running':
      return MET.running;
    case 'cycling':
      return MET.cycling;
    case 'swimming':
      return MET.swimming;
    case 'other':
      return MET.walking;
  }
}

export interface PlannedSport {
  sportCode: SportCode;
  weeklyFrequency: number;
  durationMin: number;
  intensity: number;
}

export interface PlannedExerciseItem {
  kind: 'strength' | SportCode;
  met: number;
  minutesPerWeek: number;
  kcalPerWeek: number;
}

export interface PlannedExercise {
  items: PlannedExerciseItem[];
  kcalPerWeek: number;
  minutesPerWeek: number;
}

/** Exercício planejado da semana: sessões de academia + esportes (ADR-016). */
export function plannedWeeklyExercise(
  gymSessionMinutes: readonly number[],
  sports: readonly PlannedSport[],
  weightKg: number,
): PlannedExercise {
  const items: PlannedExerciseItem[] = [];
  const gymMinutes = gymSessionMinutes.reduce((a, b) => a + b, 0);
  if (gymMinutes > 0) {
    items.push({
      kind: 'strength',
      met: MET.strengthModerate,
      minutesPerWeek: gymMinutes,
      kcalPerWeek: netExerciseKcal(MET.strengthModerate, weightKg, gymMinutes),
    });
  }
  for (const s of sports) {
    const minutes = s.weeklyFrequency * s.durationMin;
    if (minutes <= 0) continue;
    const met = sportMet(s.sportCode, s.intensity);
    items.push({
      kind: s.sportCode,
      met,
      minutesPerWeek: minutes,
      kcalPerWeek: netExerciseKcal(met, weightKg, minutes),
    });
  }
  return {
    items,
    kcalPerWeek: items.reduce((a, i) => a + i.kcalPerWeek, 0),
    minutesPerWeek: items.reduce((a, i) => a + i.minutesPerWeek, 0),
  };
}

export interface TdeeResult {
  lifestyleFactor: number;
  /** TMB × fator de estilo de vida. */
  lifestyleKcal: number;
  exerciseKcalPerDay: number;
  /** Média diária da semana planejada. */
  kcal: number;
}

/** GET_dia médio = TMB × fator + kcal de exercício líquido / 7 (PROMPT_MESTRE 5.2). */
export function tdeeFormula(
  bmrKcal: number,
  lifestyle: ActivityLifestyle,
  exerciseKcalPerWeek: number,
): TdeeResult {
  const lifestyleFactor = LIFESTYLE_FACTORS[lifestyle];
  const lifestyleKcal = bmrKcal * lifestyleFactor;
  const exerciseKcalPerDay = exerciseKcalPerWeek / 7;
  return {
    lifestyleFactor,
    lifestyleKcal,
    exerciseKcalPerDay,
    kcal: lifestyleKcal + exerciseKcalPerDay,
  };
}
