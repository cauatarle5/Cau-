import { z } from 'zod';

import { dateSchema } from './common';
import { sportCodeSchema } from './profile';
import { programInputSchema, programWarningSchema } from './training';

const scale = z.number().int().min(1).max(5);

// Atividades ----------------------------------------------------------------

const activityFields = z.object({
  date: dateSchema,
  sportCode: sportCodeSchema,
  durationMin: z.number().int().min(1).max(600),
  intensityRpe: z.number().int().min(1).max(10),
  lowerBodyDemand: z.number().int().min(1).max(3),
  distanceKm: z.number().min(0).max(500).nullable(),
  notes: z.string().max(500).nullable(),
});
export const activityInputSchema = activityFields.extend({
  distanceKm: activityFields.shape.distanceKm.optional(),
  notes: activityFields.shape.notes.optional(),
});
export type ActivityInput = z.input<typeof activityInputSchema>;
export const activityPatchSchema = activityFields.partial();
export const activitySchema = activityFields.extend({
  id: z.uuid(),
  /** Carga sRPE em UA (P8.5). */
  loadAU: z.number(),
});
export type ActivityDto = z.infer<typeof activitySchema>;
export const activityListSchema = z.object({ items: z.array(activitySchema) });
export const rangeQuerySchema = z
  .object({ from: dateSchema, to: dateSchema })
  .refine((q) => q.from <= q.to, {
    message: 'A data inicial deve ser anterior à final',
    path: ['from'],
  });

// Check-in e prontidão -------------------------------------------------------

export const readinessDriverSchema = z.enum([
  'sleep',
  'energy',
  'fatigue',
  'soreness',
  'stress',
  'high_acwr',
  'sport_yesterday',
]);
export const readinessSchema = z.object({
  score: z.number().int().nullable(),
  band: z.enum(['green', 'yellow', 'red', 'unknown']),
  drivers: z.array(readinessDriverSchema),
});
export type ReadinessDto = z.infer<typeof readinessSchema>;

export const checkinPutSchema = z.object({
  sleepHours: z.number().min(0).max(16).nullable(),
  sleepQuality: scale,
  energy: scale,
  stress: scale,
  fatigue: scale,
  soreness: scale,
  availableMinutes: z.number().int().min(10).max(300).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
export type CheckinInput = z.input<typeof checkinPutSchema>;
export const checkinSchema = z.object({
  date: z.string(),
  checkin: checkinPutSchema
    .extend({
      availableMinutes: z.number().int().nullable(),
      notes: z.string().nullable(),
    })
    .nullable(),
  readiness: readinessSchema,
});
export type CheckinDto = z.infer<typeof checkinSchema>;

// Dor -------------------------------------------------------------------------

export const painRegionSchema = z.enum([
  'shoulder',
  'elbow',
  'wrist',
  'lower_back',
  'hip',
  'knee',
  'ankle',
  'neck',
  'other',
]);
export const painReportInputSchema = z.object({
  date: dateSchema,
  bodyRegion: painRegionSchema,
  intensity: z.number().int().min(0).max(10),
  sessionId: z.uuid().nullable().optional(),
  duringExerciseId: z.uuid().nullable().optional(),
  type: z.enum(['joint', 'muscle', 'other']).default('other'),
  notes: z.string().max(500).nullable().optional(),
});
export const painReportSchema = z.object({
  id: z.uuid(),
  date: z.string(),
  bodyRegion: painRegionSchema,
  intensity: z.number().int(),
  sessionId: z.uuid().nullable(),
  duringExerciseId: z.uuid().nullable(),
  type: z.enum(['joint', 'muscle', 'other']),
  notes: z.string().nullable(),
  /** Dor ≥ 7: recomendação de avaliação profissional (ADR-046). */
  seeProfessional: z.boolean(),
});

// Carga -------------------------------------------------------------------------

export const loadSnapshotSchema = z.object({
  date: z.string(),
  dayAU: z.number(),
  acute7d: z.number(),
  chronic28d: z.number(),
  acwr: z.number().nullable(),
  monotony7d: z.number().nullable(),
  strain7d: z.number().nullable(),
});
export const recoveryLoadSchema = z.object({ items: z.array(loadSnapshotSchema) });
export type RecoveryLoadDto = z.infer<typeof recoveryLoadSchema>;

// Agenda e adaptação -------------------------------------------------------------

export const plannedWorkoutSchema = z.object({
  id: z.uuid(),
  date: z.string(),
  weekIndex: z.number().int(),
  status: z.enum(['planned', 'done', 'skipped', 'moved', 'adapted']),
  workoutTemplateId: z.uuid(),
  templateName: z.string(),
  programId: z.uuid(),
  rir: z.number().int(),
  volumeFactor: z.number(),
  deload: z.boolean(),
  sessionId: z.uuid().nullable(),
});
export type PlannedWorkoutDto = z.infer<typeof plannedWorkoutSchema>;
export const plannedWorkoutListSchema = z.object({ items: z.array(plannedWorkoutSchema) });
export const plannedWorkoutPatchSchema = z.object({
  date: dateSchema.optional(),
  status: z.enum(['planned', 'skipped']).optional(),
});

export const adaptedWorkoutSchema = z.object({
  plannedWorkout: plannedWorkoutSchema,
  readiness: readinessSchema,
  mode: z.enum(['normal', 'reduced', 'light', 'rest']),
  changed: z.boolean(),
  noRecords: z.boolean(),
  seeProfessional: z.boolean(),
  explanation: z.array(z.string()),
  estimatedMinutes: z.number(),
  exercises: z.array(
    z.object({
      exerciseId: z.uuid(),
      name: z.string(),
      sets: z.number().int(),
      originalSets: z.number().int(),
      repMin: z.number().int(),
      repMax: z.number().int(),
      targetRir: z.number().int().nullable(),
      removed: z.boolean(),
      substitute: z.boolean(),
      target: z
        .object({
          action: z.enum(['increase', 'keep', 'decrease', 'none']),
          loadKg: z.number().nullable(),
          repMin: z.number().int(),
          repMax: z.number().int(),
        })
        .nullable(),
    }),
  ),
});
export type AdaptedWorkoutDto = z.infer<typeof adaptedWorkoutSchema>;
export const adaptedQuerySchema = z.object({ redChoice: z.enum(['light', 'rest']).optional() });

// Gerador ---------------------------------------------------------------------------

export const programGenerateSchema = z.object({
  days: z.number().int().min(2).max(6).optional(),
  minutesPerSession: z.number().int().min(20).max(180).optional(),
});
export const programDraftSchema = z.object({
  split: z.enum(['full_body', 'upper_lower', 'upper_lower_ppl', 'ppl']),
  days: z.number().int(),
  minutesPerSession: z.number().int(),
  program: programInputSchema,
  /** Nomes dos exercícios do rascunho, por id (exibição). */
  exerciseNames: z.record(z.string(), z.string()),
  warnings: z.array(programWarningSchema),
});
export type ProgramDraftDto = z.infer<typeof programDraftSchema>;
