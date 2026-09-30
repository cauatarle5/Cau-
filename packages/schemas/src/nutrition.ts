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

export const dayTargetsSchema = targetsSchema.extend({
  date: z.string(),
  /** Distribuição por tipo de dia entra na Fase 2 (ADR-015). */
  dayType: z.null(),
  method: z.literal('formula'),
});

export const targetsResponseSchema = z.object({
  blocked: targetsBlockedSchema.nullable(),
  targets: targetsSchema.nullable(),
  breakdown: targetsBreakdownSchema.nullable(),
  days: z.array(dayTargetsSchema),
});
export type TargetsResponse = z.infer<typeof targetsResponseSchema>;
