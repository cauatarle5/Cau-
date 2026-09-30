import { roundTo } from '../units';

import { FAT_MIN_G_PER_KG } from './macros';
import { MIN_KCAL } from './safety';
import type { Targets } from './targets';
import { KCAL_PER_G, type Sex } from './types';

export type DayType = 'rest' | 'training' | 'hard_training' | 'sport' | 'sport_and_training';

/** Tipo de dia pelo plano (ADR-026): academia e/ou esporte planejados. */
export function planDayType(plan: { gym: boolean; sport: boolean; hardGym?: boolean }): DayType {
  if (plan.gym && plan.sport) return 'sport_and_training';
  if (plan.sport) return 'sport';
  if (plan.gym) return plan.hardGym ? 'hard_training' : 'training';
  return 'rest';
}

export interface WeekDayPlan {
  date: string;
  dayType: DayType;
  /** kcal líquidas do esporte planejado no dia. */
  sportKcal: number;
  /** Minutos de exercício planejados no dia (água). */
  exerciseMinutes: number;
}

/** Ajuste bruto do dia sobre a base (P5.8), antes do rebalanceamento. */
export function rawDayKcal(base: number, day: WeekDayPlan): number {
  switch (day.dayType) {
    case 'rest':
      return base * 0.9;
    case 'training':
      return base;
    case 'hard_training':
      return base * 1.05;
    case 'sport':
    case 'sport_and_training':
      return Math.min(base + day.sportKcal, base * 1.25);
  }
}

export interface DayTargets extends Targets {
  date: string;
  dayType: DayType;
}

/**
 * Distribui a semana (P5.8): média semanal de kcal preservada, proteína fixa,
 * diferenças no carboidrato. A diferença para a média é repartida igualmente entre
 * os dias e cada dia respeita o piso de segurança (≥ TMB e ≥ 1500/1200).
 */
export function distributeWeek(params: {
  base: Targets;
  week: readonly WeekDayPlan[];
  weightKg: number;
  bmrKcal: number;
  sex: Sex;
}): DayTargets[] {
  const { base, week, weightKg, bmrKcal, sex } = params;
  if (week.length === 0) return [];
  const raw = week.map((d) => rawDayKcal(base.kcal, d));
  const diff = (base.kcal * week.length - raw.reduce((a, b) => a + b, 0)) / week.length;
  const floor = Math.max(bmrKcal, MIN_KCAL[sex]);

  return week.map((day, i) => {
    const kcal = Math.max(floor, Math.round((raw[i] ?? base.kcal) + diff));
    let fatG = base.fatG;
    let carbsG =
      (kcal - base.proteinG * KCAL_PER_G.protein - fatG * KCAL_PER_G.fat) / KCAL_PER_G.carbs;
    // Piso de carboidrato em dias de treino pesado/esporte: reduz gordura até 0,6 g/kg.
    if (
      day.dayType === 'hard_training' ||
      day.dayType === 'sport' ||
      day.dayType === 'sport_and_training'
    ) {
      const floorCarbs = 2 * weightKg;
      if (carbsG < floorCarbs) {
        const fatNeeded =
          (kcal - base.proteinG * KCAL_PER_G.protein - floorCarbs * KCAL_PER_G.carbs) /
          KCAL_PER_G.fat;
        fatG = Math.max(FAT_MIN_G_PER_KG * weightKg, Math.min(fatG, fatNeeded));
        carbsG =
          (kcal - base.proteinG * KCAL_PER_G.protein - fatG * KCAL_PER_G.fat) / KCAL_PER_G.carbs;
      }
    }
    return {
      date: day.date,
      dayType: day.dayType,
      kcal,
      proteinG: base.proteinG,
      fatG: Math.round(fatG),
      carbsG: Math.max(0, Math.round(carbsG)),
      fiberG: Math.round(Math.max(25, (14 * kcal) / 1000)),
      waterMl: roundTo((35 * weightKg + (500 * day.exerciseMinutes) / 60) / 50) * 50,
    };
  });
}

export interface DayTotals {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  waterMl: number;
}

/** Restante do dia = meta − consumido, por nutriente (negativo = acima da meta). */
export function remainingTargets(targets: DayTotals, consumed: DayTotals): DayTotals {
  return {
    kcal: targets.kcal - consumed.kcal,
    proteinG: targets.proteinG - consumed.proteinG,
    carbsG: targets.carbsG - consumed.carbsG,
    fatG: targets.fatG - consumed.fatG,
    fiberG: targets.fiberG - consumed.fiberG,
    waterMl: targets.waterMl - consumed.waterMl,
  };
}
