import {
  boolean,
  date,
  doublePrecision,
  index,
  pgTable,
  smallint,
  text,
  time,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAt, idColumn, updatedAt } from './columns';
import {
  activityLifestyleEnum,
  availabilityKindEnum,
  equipmentLocationEnum,
  primaryGoalEnum,
  sexEnum,
  sportCodeEnum,
  trainingExperienceEnum,
} from './enums';
import { users } from './users';

const userRef = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

/** 1:1 com `users`. */
export const profiles = pgTable('profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  sex: sexEnum('sex').notNull(),
  birthDate: date('birth_date', { mode: 'string' }).notNull(),
  heightCm: doublePrecision('height_cm').notNull(),
  trainingExperience: trainingExperienceEnum('training_experience').notNull(),
  trainingAgeYears: doublePrecision('training_age_years'),
  conditioningLevel: smallint('conditioning_level').notNull(),
  activityLifestyle: activityLifestyleEnum('activity_lifestyle').notNull(),
  aestheticPriorities: text('aesthetic_priorities').array().notNull().default([]),
  performancePriorities: text('performance_priorities').array().notNull().default([]),
  notes: text('notes'),
  /** ADR-017. */
  clinicalCondition: boolean('clinical_condition').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const availability = pgTable(
  'availability',
  {
    id: idColumn(),
    userId: userRef(),
    weekday: smallint('weekday').notNull(),
    startTime: time('start_time'),
    endTime: time('end_time'),
    maxMinutes: smallint('max_minutes').notNull(),
    kind: availabilityKindEnum('kind').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('availability_user_id_idx').on(t.userId)],
);

/** Catálogo global (seed). */
export const equipment = pgTable('equipment', {
  code: text('code').primaryKey(),
  namePt: text('name_pt').notNull(),
});

export const equipmentAccess = pgTable(
  'equipment_access',
  {
    id: idColumn(),
    userId: userRef(),
    equipmentCode: text('equipment_code')
      .notNull()
      .references(() => equipment.code),
    location: equipmentLocationEnum('location').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('equipment_access_user_id_idx').on(t.userId)],
);

export const limitations = pgTable(
  'limitations',
  {
    id: idColumn(),
    userId: userRef(),
    bodyRegion: text('body_region').notNull(),
    description: text('description').notNull().default(''),
    severity: smallint('severity').notNull(),
    contraindicatedPatterns: text('contraindicated_patterns').array().notNull().default([]),
    active: boolean('active').notNull().default(true),
    startedAt: date('started_at', { mode: 'string' }),
    resolvedAt: date('resolved_at', { mode: 'string' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('limitations_user_id_idx').on(t.userId)],
);

/** Versionado: nunca editar, sempre inserir (DATA_MODEL 4.1). */
export const goals = pgTable(
  'goals',
  {
    id: idColumn(),
    userId: userRef(),
    primaryGoal: primaryGoalEnum('primary_goal').notNull(),
    targetWeightKg: doublePrecision('target_weight_kg'),
    targetBodyFatPct: doublePrecision('target_body_fat_pct'),
    targetRatePctPerWeek: doublePrecision('target_rate_pct_per_week'),
    proteinGPerKg: doublePrecision('protein_g_per_kg'),
    trainingFocus: text('training_focus'),
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('goals_user_id_effective_idx').on(t.userId, t.effectiveFrom)],
);

export const sports = pgTable(
  'sports',
  {
    id: idColumn(),
    userId: userRef(),
    sportCode: sportCodeEnum('sport_code').notNull(),
    weeklyFrequency: smallint('weekly_frequency').notNull(),
    typicalDurationMin: smallint('typical_duration_min').notNull(),
    typicalIntensity: smallint('typical_intensity').notNull(),
    weekdayHint: smallint('weekday_hint'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('sports_user_id_idx').on(t.userId)],
);

export type ProfileRow = typeof profiles.$inferSelect;
export type AvailabilityRow = typeof availability.$inferSelect;
export type LimitationRow = typeof limitations.$inferSelect;
export type GoalRow = typeof goals.$inferSelect;
export type SportRow = typeof sports.$inferSelect;
