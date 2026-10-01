import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAt, idColumn, updatedAt } from './columns';
import {
  mesocyclePhaseEnum,
  plannedWorkoutStatusEnum,
  exercisePreferenceEnum,
  generatedByEnum,
  lateralityEnum,
  loadTypeEnum,
  mechanicsEnum,
  movementPatternEnum,
  muscleGroupEnum,
  muscleRegionEnum,
  muscleRoleEnum,
  programStatusEnum,
  recordTypeEnum,
  sessionExerciseStatusEnum,
  sessionSourceEnum,
  setTypeEnum,
} from './enums';
import { users } from './users';

const userRef = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

export const muscles = pgTable('muscles', {
  code: text('code').primaryKey(),
  namePt: text('name_pt').notNull(),
  group: muscleGroupEnum('group').notNull(),
  region: muscleRegionEnum('region').notNull(),
});

/** Catálogo: `user_id` nulo = sistema; preenchido = personalizado (ADR-033). */
export const exercises = pgTable(
  'exercises',
  {
    id: idColumn(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    namePt: text('name_pt').notNull(),
    nameNormalized: text('name_normalized').notNull(),
    aliases: text('aliases')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    movementPattern: movementPatternEnum('movement_pattern').notNull(),
    mechanics: mechanicsEnum('mechanics').notNull(),
    laterality: lateralityEnum('laterality').notNull(),
    equipmentCodes: text('equipment_codes')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    loadType: loadTypeEnum('load_type').notNull(),
    defaultIncrementKg: doublePrecision('default_increment_kg').notNull(),
    contraindicationTags: text('contraindication_tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    instructions: text('instructions'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('exercises_user_idx').on(t.userId),
    uniqueIndex('exercises_system_name_uq')
      .on(t.nameNormalized)
      .where(sql`${t.userId} is null`),
    index('exercises_name_trgm_idx').using('gin', sql`${t.nameNormalized} gin_trgm_ops`),
  ],
);

export const exerciseMuscles = pgTable(
  'exercise_muscles',
  {
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    muscleCode: text('muscle_code')
      .notNull()
      .references(() => muscles.code),
    role: muscleRoleEnum('role').notNull(),
    weight: doublePrecision('weight').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.exerciseId, t.muscleCode] }),
    index('exercise_muscles_muscle_idx').on(t.muscleCode),
  ],
);

export const exercisePreferences = pgTable(
  'exercise_preferences',
  {
    userId: userRef(),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    preference: exercisePreferenceEnum('preference').notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.exerciseId] })],
);

/** Um programa ativo por usuário (ADR-035). */
export const programs = pgTable(
  'programs',
  {
    id: idColumn(),
    userId: userRef(),
    name: text('name').notNull(),
    goalSnapshot: jsonb('goal_snapshot'),
    startDate: date('start_date', { mode: 'string' }),
    endDate: date('end_date', { mode: 'string' }),
    status: programStatusEnum('status').notNull().default('draft'),
    generatedBy: generatedByEnum('generated_by').notNull().default('manual'),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('programs_user_status_idx').on(t.userId, t.status),
    uniqueIndex('programs_one_active_uq')
      .on(t.userId)
      .where(sql`${t.status} = 'active'`),
  ],
);

export const workoutTemplates = pgTable(
  'workout_templates',
  {
    id: idColumn(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    dayOrder: smallint('day_order').notNull(),
    focusMuscles: text('focus_muscles')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    estimatedMinutes: smallint('estimated_minutes'),
    createdAt: createdAt(),
  },
  (t) => [index('workout_templates_program_idx').on(t.programId)],
);

export const templateExercises = pgTable(
  'template_exercises',
  {
    id: idColumn(),
    workoutTemplateId: uuid('workout_template_id')
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: 'cascade' }),
    order: smallint('order').notNull(),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id),
    sets: smallint('sets').notNull(),
    repMin: smallint('rep_min').notNull(),
    repMax: smallint('rep_max').notNull(),
    targetRir: smallint('target_rir'),
    restSeconds: integer('rest_seconds'),
    supersetGroup: text('superset_group'),
    notes: text('notes'),
  },
  (t) => [index('template_exercises_template_idx').on(t.workoutTemplateId)],
);

/** Mesociclo padrão do programa (ADR-043). */
export const mesocycles = pgTable(
  'mesocycles',
  {
    id: idColumn(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    order: smallint('order').notNull(),
    name: text('name').notNull(),
    phase: mesocyclePhaseEnum('phase').notNull(),
    weeks: smallint('weeks').notNull(),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    rirProgression: integer('rir_progression').array().notNull(),
    volumeProgression: doublePrecision('volume_progression').array().notNull(),
  },
  (t) => [index('mesocycles_program_idx').on(t.programId)],
);

/** Agenda materializada ao ativar o programa (ADR-043). */
export const plannedWorkouts = pgTable(
  'planned_workouts',
  {
    id: idColumn(),
    userId: userRef(),
    date: date('date', { mode: 'string' }).notNull(),
    workoutTemplateId: uuid('workout_template_id')
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: 'cascade' }),
    mesocycleId: uuid('mesocycle_id').references(() => mesocycles.id, { onDelete: 'cascade' }),
    weekIndex: smallint('week_index').notNull(),
    status: plannedWorkoutStatusEnum('status').notNull().default('planned'),
    adaptationReason: text('adaptation_reason'),
    adaptedPayload: jsonb('adapted_payload'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('planned_workouts_user_date_idx').on(t.userId, t.date),
    index('planned_workouts_user_status_date_idx').on(t.userId, t.status, t.date),
  ],
);

/** `workout_template_id` liga a sessão ao template sem agenda (ADR-035). */
export const workoutSessions = pgTable(
  'workout_sessions',
  {
    id: idColumn(),
    userId: userRef(),
    date: date('date', { mode: 'string' }).notNull(),
    workoutTemplateId: uuid('workout_template_id').references(() => workoutTemplates.id, {
      onDelete: 'set null',
    }),
    plannedWorkoutId: uuid('planned_workout_id').references(() => plannedWorkouts.id, {
      onDelete: 'set null',
    }),
    /** Adaptada por prontidão/contexto: fora da progressão dupla (ADR-045). */
    adapted: boolean('adapted').notNull().default(false),
    adaptationNote: text('adaptation_note'),
    /** Snapshot do nome (histórico imutável). */
    name: text('name').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationMin: integer('duration_min'),
    sessionRpe: smallint('session_rpe'),
    perceivedDifficulty: smallint('perceived_difficulty'),
    notes: text('notes'),
    source: sessionSourceEnum('source').notNull().default('app'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('workout_sessions_user_date_idx').on(t.userId, t.date)],
);

/** Metas e nome copiados do template/catálogo: editar depois não altera o passado. */
export const sessionExercises = pgTable(
  'session_exercises',
  {
    id: idColumn(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    order: smallint('order').notNull(),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id),
    exerciseName: text('exercise_name').notNull(),
    templateExerciseId: uuid('template_exercise_id').references(() => templateExercises.id, {
      onDelete: 'set null',
    }),
    substitutedFromExerciseId: uuid('substituted_from_exercise_id').references(() => exercises.id),
    status: sessionExerciseStatusEnum('status').notNull().default('pending'),
    skipReason: text('skip_reason'),
    targetSets: smallint('target_sets'),
    repMin: smallint('rep_min'),
    repMax: smallint('rep_max'),
    targetRir: smallint('target_rir'),
    restSeconds: integer('rest_seconds'),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (t) => [
    index('session_exercises_session_idx').on(t.sessionId),
    index('session_exercises_exercise_session_idx').on(t.exerciseId, t.sessionId),
  ],
);

export const setLogs = pgTable(
  'set_logs',
  {
    id: idColumn(),
    sessionExerciseId: uuid('session_exercise_id')
      .notNull()
      .references(() => sessionExercises.id, { onDelete: 'cascade' }),
    setIndex: smallint('set_index').notNull(),
    setType: setTypeEnum('set_type').notNull().default('working'),
    reps: smallint('reps'),
    loadKg: doublePrecision('load_kg'),
    rir: smallint('rir'),
    rpe: doublePrecision('rpe'),
    restSeconds: integer('rest_seconds'),
    durationSeconds: integer('duration_seconds'),
    completed: boolean('completed').notNull().default(true),
    loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('set_logs_session_exercise_idx').on(t.sessionExerciseId, t.loggedAt)],
);

/** Recalculável a partir de `set_logs`. */
export const personalRecords = pgTable(
  'personal_records',
  {
    id: idColumn(),
    userId: userRef(),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    recordType: recordTypeEnum('record_type').notNull(),
    value: doublePrecision('value').notNull(),
    reps: smallint('reps'),
    loadKg: doublePrecision('load_kg'),
    setLogId: uuid('set_log_id').references(() => setLogs.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => workoutSessions.id, { onDelete: 'cascade' }),
    achievedAt: timestamp('achieved_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('personal_records_user_exercise_idx').on(t.userId, t.exerciseId, t.recordType)],
);

/** Respostas de criações com `Idempotency-Key` (ADR-034). */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    userId: userRef(),
    key: text('key').notNull(),
    method: text('method').notNull(),
    path: text('path').notNull(),
    statusCode: smallint('status_code').notNull(),
    response: jsonb('response'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.key] }),
    index('idempotency_keys_created_idx').on(t.createdAt),
  ],
);

export type ExerciseRow = typeof exercises.$inferSelect;
export type ProgramRow = typeof programs.$inferSelect;
export type WorkoutTemplateRow = typeof workoutTemplates.$inferSelect;
export type TemplateExerciseRow = typeof templateExercises.$inferSelect;
export type WorkoutSessionRow = typeof workoutSessions.$inferSelect;
export type SessionExerciseRow = typeof sessionExercises.$inferSelect;
export type SetLogRow = typeof setLogs.$inferSelect;
export type PersonalRecordRow = typeof personalRecords.$inferSelect;
export type MesocycleRow = typeof mesocycles.$inferSelect;
export type PlannedWorkoutRow = typeof plannedWorkouts.$inferSelect;
