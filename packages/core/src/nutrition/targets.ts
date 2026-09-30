import { roundTo } from '../units';

import { selectBmr, type BmrInput, type BmrResult } from './bmr';
import { energyAdjustment, type EnergyAdjustment } from './goals';
import {
  carbsAndFat,
  fatTarget,
  fiberTarget,
  proteinTarget,
  waterTarget,
  type ProteinResult,
} from './macros';
import { applySafetyLocks, type SafetyLock } from './safety';
import {
  plannedWeeklyExercise,
  tdeeFormula,
  type PlannedExercise,
  type PlannedSport,
  type TdeeResult,
} from './tdee';
import type { ActivityLifestyle, PrimaryGoal, TrainingExperience } from './types';

export interface TargetsInput {
  sex: BmrInput['sex'];
  ageYears: number;
  heightCm: number;
  /** Tendência de peso (PROMPT_MESTRE 5.1), não a pesagem isolada. */
  weightKg: number;
  bodyFat?: BmrInput['bodyFat'];
  lifestyle: ActivityLifestyle;
  experience: TrainingExperience;
  goal: PrimaryGoal;
  targetRatePctPerWeek?: number | null;
  proteinGPerKg?: number | null;
  gymSessionMinutes: readonly number[];
  sports: readonly PlannedSport[];
}

export interface Targets {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  waterMl: number;
}

/** Tudo o que entrou no cálculo, para explicar as metas ao usuário. */
export interface TargetsBreakdown {
  weightKg: number;
  bmr: BmrResult;
  exercise: PlannedExercise;
  tdee: TdeeResult;
  adjustment: EnergyAdjustment;
  kcalBeforeLocks: number;
  locksApplied: SafetyLock[];
  protein: ProteinResult;
  exerciseHoursPerDay: number;
}

export interface TargetsResult {
  targets: Targets;
  breakdown: TargetsBreakdown;
}

/**
 * Metas de um dia base (média semanal) por fórmula: TMB → GET → objetivo → travas →
 * proteína, gordura, fibra, carboidrato (restante) e água (PROMPT_MESTRE 5.1–5.7).
 */
export function computeTargets(input: TargetsInput): TargetsResult {
  const { weightKg } = input;
  const bodyFatPct = input.bodyFat?.pct ?? null;

  const bmr = selectBmr({
    sex: input.sex,
    weightKg,
    heightCm: input.heightCm,
    ageYears: input.ageYears,
    bodyFat: input.bodyFat ?? null,
  });
  const exercise = plannedWeeklyExercise(input.gymSessionMinutes, input.sports, weightKg);
  const tdee = tdeeFormula(bmr.kcal, input.lifestyle, exercise.kcalPerWeek);
  const adjustment = energyAdjustment({
    goal: input.goal,
    experience: input.experience,
    tdeeKcal: tdee.kcal,
    weightKg,
    targetRatePctPerWeek: input.targetRatePctPerWeek ?? null,
  });
  const kcalBeforeLocks = tdee.kcal + adjustment.kcalDelta;
  const locked = applySafetyLocks({
    kcal: kcalBeforeLocks,
    tdeeKcal: tdee.kcal,
    bmrKcal: bmr.kcal,
    sex: input.sex,
  });

  const kcal = Math.round(locked.kcal);
  const protein = proteinTarget({
    goal: input.goal,
    sex: input.sex,
    weightKg,
    bodyFatPct,
    proteinGPerKgOverride: input.proteinGPerKg ?? null,
  });
  const proteinG = Math.round(protein.grams);
  const macros = carbsAndFat({
    kcal,
    proteinG,
    fatG: Math.round(fatTarget(weightKg, kcal)),
    weightKg,
  });
  const exerciseHoursPerDay = exercise.minutesPerWeek / 60 / 7;

  return {
    targets: {
      kcal,
      proteinG,
      fatG: Math.round(macros.fatG),
      carbsG: Math.round(macros.carbsG),
      fiberG: Math.round(fiberTarget(kcal)),
      waterMl: roundTo(waterTarget(weightKg, exerciseHoursPerDay) / 50) * 50,
    },
    breakdown: {
      weightKg,
      bmr,
      exercise,
      tdee,
      adjustment,
      kcalBeforeLocks,
      locksApplied: locked.applied,
      protein,
      exerciseHoursPerDay,
    },
  };
}
