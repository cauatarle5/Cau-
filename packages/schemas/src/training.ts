import { z } from 'zod';

import { dateSchema } from './common';

// Enums -------------------------------------------------------------------

export const muscleCodes = [
  'chest',
  'front_delts',
  'side_delts',
  'rear_delts',
  'lats',
  'upper_back',
  'traps',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'obliques',
  'lower_back',
  'glutes',
  'quads',
  'hamstrings',
  'adductors',
  'abductors',
  'calves',
] as const;
export const muscleCodeSchema = z.enum(muscleCodes);

export const movementPatternSchema = z.enum([
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'squat',
  'hinge',
  'lunge',
  'isolation_upper',
  'isolation_lower',
  'core',
  'carry',
  'cardio',
]);
export const mechanicsSchema = z.enum(['compound', 'isolation']);
export const lateralitySchema = z.enum(['bilateral', 'unilateral']);
export const loadTypeSchema = z.enum(['external', 'bodyweight', 'assisted', 'time']);
export const exercisePreferenceSchema = z.enum(['like', 'neutral', 'dislike', 'avoid']);
export const programStatusSchema = z.enum(['draft', 'active', 'completed', 'archived']);
export const setTypeSchema = z.enum(['warmup', 'working', 'drop', 'failure', 'backoff']);
export const sessionExerciseStatusSchema = z.enum(['pending', 'done', 'skipped', 'substituted']);
export const recordTypeSchema = z.enum(['e1rm', 'max_load', 'rep_at_load', 'volume_session']);
export const volumeStatusSchema = z.enum([
  'below_mev',
  'minimum',
  'productive',
  'high',
  'above_mrv',
]);

const instant = z.iso.datetime({ offset: true, message: 'Data e hora inválidas' });
const name = (label: string) =>
  z
    .string()
    .trim()
    .min(1, { message: `Informe ${label}` })
    .max(120);

// Exercícios --------------------------------------------------------------

export const exerciseSchema = z.object({
  id: z.uuid(),
  namePt: z.string(),
  aliases: z.array(z.string()),
  movementPattern: movementPatternSchema,
  mechanics: mechanicsSchema,
  laterality: lateralitySchema,
  equipmentCodes: z.array(z.string()),
  loadType: loadTypeSchema,
  defaultIncrementKg: z.number(),
  contraindicationTags: z.array(z.string()),
  isCustom: z.boolean(),
  primaryMuscles: z.array(muscleCodeSchema),
  secondaryMuscles: z.array(muscleCodeSchema),
  preference: exercisePreferenceSchema.nullable(),
});
export type ExerciseDto = z.infer<typeof exerciseSchema>;
export const exerciseListSchema = z.object({ items: z.array(exerciseSchema) });

export const exerciseSearchQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  muscle: muscleCodeSchema.optional(),
  equipment: z.string().max(40).optional(),
  pattern: movementPatternSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const customExerciseInputSchema = z
  .object({
    namePt: name('o nome'),
    movementPattern: movementPatternSchema,
    mechanics: mechanicsSchema,
    laterality: lateralitySchema.default('bilateral'),
    equipmentCodes: z.array(z.string().max(40)).max(10).default([]),
    loadType: loadTypeSchema.default('external'),
    defaultIncrementKg: z.number().min(0).max(20).default(2.5),
    primaryMuscles: z.array(muscleCodeSchema).min(1, { message: 'Escolha o músculo principal' }),
    secondaryMuscles: z.array(muscleCodeSchema).default([]),
  })
  .refine((v) => !v.secondaryMuscles.some((m) => v.primaryMuscles.includes(m)), {
    message: 'Um músculo não pode ser principal e secundário',
    path: ['secondaryMuscles'],
  });

export const exercisePreferencesPutSchema = z.object({
  items: z.array(z.object({ exerciseId: z.uuid(), preference: exercisePreferenceSchema })).max(500),
});
export const exercisePreferencesSchema = exercisePreferencesPutSchema;

export const exerciseProgressQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});
export const personalRecordSchema = z.object({
  exerciseId: z.uuid(),
  exerciseName: z.string(),
  type: recordTypeSchema,
  value: z.number(),
  reps: z.number().nullable(),
  loadKg: z.number().nullable(),
  achievedAt: z.string(),
});
export type PersonalRecordDto = z.infer<typeof personalRecordSchema>;
export const exerciseProgressSchema = z.object({
  exercise: exerciseSchema,
  points: z.array(
    z.object({
      date: z.string(),
      sessionId: z.uuid(),
      bestE1rm: z.number().nullable(),
      topLoadKg: z.number().nullable(),
      tonnage: z.number(),
      workingSets: z.number().int(),
    }),
  ),
  records: z.array(personalRecordSchema),
});
export type ExerciseProgress = z.infer<typeof exerciseProgressSchema>;

// Programas ---------------------------------------------------------------

export const templateExerciseInputSchema = z
  .object({
    exerciseId: z.uuid(),
    sets: z.number().int().min(1).max(10),
    repMin: z.number().int().min(1).max(100),
    repMax: z.number().int().min(1).max(100),
    targetRir: z.number().int().min(0).max(5).nullable().default(2),
    restSeconds: z.number().int().min(0).max(900).nullable().default(120),
    supersetGroup: z.string().max(4).nullable().optional(),
    notes: z.string().max(300).nullable().optional(),
  })
  .refine((v) => v.repMin <= v.repMax, {
    message: 'Mínimo de repetições acima do máximo',
    path: ['repMin'],
  });
export const workoutTemplateInputSchema = z.object({
  name: name('o nome do treino'),
  focusMuscles: z.array(muscleCodeSchema).default([]),
  estimatedMinutes: z.number().int().min(5).max(300).nullable().optional(),
  exercises: z.array(templateExerciseInputSchema).max(20),
});
export const programInputSchema = z.object({
  name: name('o nome do programa'),
  notes: z.string().max(1000).nullable().optional(),
  templates: z
    .array(workoutTemplateInputSchema)
    .min(1, { message: 'Crie ao menos um treino' })
    .max(7),
  activate: z.boolean().default(false),
});
export const programPatchSchema = z.object({
  name: name('o nome do programa').optional(),
  notes: z.string().max(1000).nullable().optional(),
  templates: programInputSchema.shape.templates.optional(),
  status: z.enum(['draft', 'completed', 'archived']).optional(),
});

export const templateExerciseSchema = z.object({
  id: z.uuid(),
  order: z.number().int(),
  exerciseId: z.uuid(),
  exerciseName: z.string(),
  sets: z.number().int(),
  repMin: z.number().int(),
  repMax: z.number().int(),
  targetRir: z.number().int().nullable(),
  restSeconds: z.number().int().nullable(),
  supersetGroup: z.string().nullable(),
  notes: z.string().nullable(),
});
export const workoutTemplateSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  dayOrder: z.number().int(),
  focusMuscles: z.array(z.string()),
  estimatedMinutes: z.number().int().nullable(),
  exercises: z.array(templateExerciseSchema),
});
export type WorkoutTemplateDto = z.infer<typeof workoutTemplateSchema>;
export const programSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  notes: z.string().nullable(),
  status: programStatusSchema,
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  createdAt: z.string(),
  templates: z.array(workoutTemplateSchema),
});
export type ProgramDto = z.infer<typeof programSchema>;
export const programListSchema = z.object({ items: z.array(programSchema) });

// Sessões -----------------------------------------------------------------

export const ghostSchema = z.object({
  setIndex: z.number().int(),
  loadKg: z.number().nullable(),
  reps: z.number().nullable(),
  rir: z.number().nullable(),
});
export type GhostDto = z.infer<typeof ghostSchema>;

export const setLogSchema = z.object({
  id: z.uuid(),
  sessionExerciseId: z.uuid(),
  setIndex: z.number().int(),
  setType: setTypeSchema,
  reps: z.number().int().nullable(),
  loadKg: z.number().nullable(),
  rir: z.number().int().nullable(),
  rpe: z.number().nullable(),
  restSeconds: z.number().int().nullable(),
  durationSeconds: z.number().int().nullable(),
  completed: z.boolean(),
  loggedAt: z.string(),
});
export type SetLogDto = z.infer<typeof setLogSchema>;

const setFields = z.object({
  setIndex: z.number().int().min(0).max(50),
  setType: setTypeSchema,
  reps: z.number().int().min(0).max(100).nullable(),
  loadKg: z.number().min(0).max(1000).nullable(),
  rir: z.number().int().min(0).max(10).nullable(),
  rpe: z.number().min(1).max(10).nullable(),
  restSeconds: z.number().int().min(0).max(3600).nullable(),
  durationSeconds: z.number().int().min(0).max(36000).nullable(),
  completed: z.boolean(),
  loggedAt: instant,
});
export const setInputSchema = setFields.partial().extend({
  /** Gerado no cliente (UUID v7) para registro offline idempotente (ADR-034). */
  id: z.uuid().optional(),
  setIndex: setFields.shape.setIndex,
  setType: setFields.shape.setType.default('working'),
  completed: setFields.shape.completed.default(true),
});
export const setPatchSchema = setFields.omit({ setIndex: true }).partial();

export const recordHitSchema = z.object({
  type: recordTypeSchema,
  value: z.number(),
  reps: z.number().nullable(),
  loadKg: z.number().nullable(),
});
export const setResultSchema = z.object({ set: setLogSchema, records: z.array(recordHitSchema) });
export type SetResult = z.infer<typeof setResultSchema>;

export const sessionExerciseSchema = z.object({
  id: z.uuid(),
  order: z.number().int(),
  exerciseId: z.uuid(),
  exerciseName: z.string(),
  loadType: loadTypeSchema,
  defaultIncrementKg: z.number(),
  templateExerciseId: z.uuid().nullable(),
  substitutedFromExerciseId: z.uuid().nullable(),
  status: sessionExerciseStatusSchema,
  skipReason: z.string().nullable(),
  targetSets: z.number().int().nullable(),
  repMin: z.number().int().nullable(),
  repMax: z.number().int().nullable(),
  targetRir: z.number().int().nullable(),
  restSeconds: z.number().int().nullable(),
  notes: z.string().nullable(),
  ghosts: z.array(ghostSchema),
  sets: z.array(setLogSchema),
});
export type SessionExerciseDto = z.infer<typeof sessionExerciseSchema>;

export const sessionSchema = z.object({
  id: z.uuid(),
  date: z.string(),
  name: z.string(),
  workoutTemplateId: z.uuid().nullable(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  durationMin: z.number().int().nullable(),
  sessionRpe: z.number().int().nullable(),
  perceivedDifficulty: z.number().int().nullable(),
  notes: z.string().nullable(),
  source: z.enum(['app', 'offline_sync', 'import']),
  exercises: z.array(sessionExerciseSchema),
  tonnage: z.number(),
  hardSets: z.number(),
  records: z.array(personalRecordSchema),
});
export type SessionDto = z.infer<typeof sessionSchema>;

export const sessionStartSchema = z
  .object({
    id: z.uuid().optional(),
    workoutTemplateId: z.uuid().nullable().optional(),
    name: name('o nome do treino').optional(),
    startedAt: instant.optional(),
  })
  .refine((v) => v.workoutTemplateId || v.name, {
    message: 'Escolha um treino ou informe um nome',
    path: ['name'],
  });

export const sessionPatchSchema = z.object({
  finish: z.boolean().optional(),
  endedAt: instant.optional(),
  durationMin: z.number().int().min(0).max(600).nullable().optional(),
  sessionRpe: z.number().int().min(1).max(10).nullable().optional(),
  perceivedDifficulty: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  /** Marcado pelo cliente quando a escrita veio da fila offline (ADR-034). */
  source: z.enum(['app', 'offline_sync']).optional(),
});

export const sessionSummarySchema = z.object({
  id: z.uuid(),
  date: z.string(),
  name: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  durationMin: z.number().int().nullable(),
  sessionRpe: z.number().int().nullable(),
  exerciseCount: z.number().int(),
  setCount: z.number().int(),
  tonnage: z.number(),
  recordCount: z.number().int(),
});
export type SessionSummaryDto = z.infer<typeof sessionSummarySchema>;
export const sessionListSchema = z.object({ items: z.array(sessionSummarySchema) });
export const sessionListQuerySchema = z
  .object({ from: dateSchema.optional(), to: dateSchema.optional() })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: 'A data inicial deve ser anterior à final',
    path: ['from'],
  });

export const sessionExerciseInputSchema = z.object({
  id: z.uuid().optional(),
  exerciseId: z.uuid(),
  targetSets: z.number().int().min(1).max(10).default(3),
  repMin: z.number().int().min(1).max(100).nullable().default(8),
  repMax: z.number().int().min(1).max(100).nullable().default(12),
  restSeconds: z.number().int().min(0).max(900).nullable().default(120),
});
export const sessionExercisePatchSchema = z.object({
  status: z.enum(['pending', 'done', 'skipped']).optional(),
  skipReason: z.string().trim().max(200).nullable().optional(),
  substituteExerciseId: z.uuid().optional(),
  notes: z.string().max(500).nullable().optional(),
});

// Análises ----------------------------------------------------------------

export const muscleVolumeQuerySchema = z.object({ weekStart: dateSchema.optional() });
export const muscleVolumeSchema = z.object({
  weekStart: z.string(),
  weekEnd: z.string(),
  items: z.array(
    z.object({
      muscle: muscleCodeSchema,
      namePt: z.string(),
      hardSets: z.number(),
      frequency: z.number().int(),
      status: volumeStatusSchema,
      alert: z.boolean(),
    }),
  ),
});
export type MuscleVolumeDto = z.infer<typeof muscleVolumeSchema>;
