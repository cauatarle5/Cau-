import { z } from 'zod';

export const targetsSchema = z.object({
  kcal: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  fiberG: z.number(),
  waterMl: z.number(),
});
export type TargetsDto = z.infer<typeof targetsSchema>;

export const safetyLockSchema = z.enum(['MAX_DEFICIT', 'MIN_BMR', 'MIN_ABSOLUTE']);

/** Insumos do cálculo, para a explicação das metas (DoD da Fase 1). */
export const targetsBreakdownSchema = z.object({
  ageYears: z.number(),
  weightKg: z.number(),
  weightDate: z.string(),
  bodyFatPct: z.number().nullable(),
  bmr: z.object({
    kcal: z.number(),
    method: z.enum(['mifflin_st_jeor', 'katch_mcardle']),
    leanMassKg: z.number().nullable(),
  }),
  exercise: z.object({
    items: z.array(
      z.object({
        kind: z.string(),
        met: z.number(),
        minutesPerWeek: z.number(),
        kcalPerWeek: z.number(),
      }),
    ),
    kcalPerWeek: z.number(),
    minutesPerWeek: z.number(),
  }),
  tdee: z.object({
    lifestyleFactor: z.number(),
    lifestyleKcal: z.number(),
    exerciseKcalPerDay: z.number(),
    kcal: z.number(),
  }),
  adjustment: z.object({
    source: z.enum(['goal', 'rate']),
    pct: z.number(),
    kcalDelta: z.number(),
  }),
  kcalBeforeLocks: z.number(),
  locksApplied: z.array(safetyLockSchema),
  protein: z.object({
    grams: z.number(),
    gPerKg: z.number(),
    basis: z.enum(['total_weight', 'lean_mass', 'user_override']),
  }),
  exerciseHoursPerDay: z.number(),
});
export type TargetsBreakdownDto = z.infer<typeof targetsBreakdownSchema>;

export const targetsBlockedSchema = z.enum(['CLINICAL_CONDITION', 'ONBOARDING_INCOMPLETE']);

export const dayTypeSchema = z.enum([
  'rest',
  'training',
  'hard_training',
  'sport',
  'sport_and_training',
]);
export type DayTypeDto = z.infer<typeof dayTypeSchema>;

export const dayTargetsSchema = targetsSchema.extend({
  date: z.string(),
  /** Derivado do plano semanal (ADR-026) ou escolhido pelo usuário. */
  dayType: dayTypeSchema,
  dayTypeOverridden: z.boolean(),
  method: z.enum(['formula', 'adaptive']),
});
export type DayTargetsDto = z.infer<typeof dayTargetsSchema>;

export const targetsResponseSchema = z.object({
  blocked: targetsBlockedSchema.nullable(),
  targets: targetsSchema.nullable(),
  breakdown: targetsBreakdownSchema.nullable(),
  days: z.array(dayTargetsSchema),
});
export type TargetsResponse = z.infer<typeof targetsResponseSchema>;

export const dayTypePutSchema = z.object({ dayType: dayTypeSchema });
export const dayParamSchema = z.object({ date: z.iso.date() });

/** Resumo do dia: metas × consumido × planejado (tela Hoje). */
export const daySummarySchema = z.object({
  date: z.string(),
  blocked: targetsBlockedSchema.nullable(),
  targets: dayTargetsSchema.nullable(),
  consumed: targetsSchema,
  planned: targetsSchema,
  remaining: targetsSchema.nullable(),
  waterMl: z.number(),
  loggedMeals: z.number().int(),
});
export type DaySummary = z.infer<typeof daySummarySchema>;
