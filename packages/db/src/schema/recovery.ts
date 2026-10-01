import { sql } from 'drizzle-orm';
import {
  date,
  doublePrecision,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAt, idColumn, updatedAt } from './columns';
import { activitySourceEnum, painRegionEnum, painTypeEnum, sportCodeEnum } from './enums';
import { exercises, workoutSessions } from './training';
import { users } from './users';

const userRef = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

/** Esportes e cardio (DATA_MODEL 4.3). */
export const activities = pgTable(
  'activities',
  {
    id: idColumn(),
    userId: userRef(),
    date: date('date', { mode: 'string' }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    sportCode: sportCodeEnum('sport_code').notNull(),
    durationMin: smallint('duration_min').notNull(),
    intensityRpe: smallint('intensity_rpe').notNull(),
    distanceKm: doublePrecision('distance_km'),
    avgHr: smallint('avg_hr'),
    kcalReported: doublePrecision('kcal_reported'),
    /** 1–3; 3 = alta demanda de membros inferiores (P8.5). */
    lowerBodyDemand: smallint('lower_body_demand').notNull(),
    notes: text('notes'),
    source: activitySourceEnum('source').notNull().default('manual'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('activities_user_date_idx').on(t.userId, t.date)],
);

/** Check-in diário (DATA_MODEL 4.4); prontidão persistida (ADR-044). */
export const dailyCheckins = pgTable(
  'daily_checkins',
  {
    id: idColumn(),
    userId: userRef(),
    date: date('date', { mode: 'string' }).notNull(),
    sleepHours: doublePrecision('sleep_hours'),
    sleepQuality: smallint('sleep_quality').notNull(),
    energy: smallint('energy').notNull(),
    stress: smallint('stress').notNull(),
    fatigue: smallint('fatigue').notNull(),
    soreness: smallint('soreness').notNull(),
    sorenessRegions: text('soreness_regions')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    availableMinutes: smallint('available_minutes'),
    notes: text('notes'),
    readinessScore: smallint('readiness_score'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('daily_checkins_user_date_uq').on(t.userId, t.date)],
);

/** Registro de dor (ADR-046). */
export const painReports = pgTable(
  'pain_reports',
  {
    id: idColumn(),
    userId: userRef(),
    date: date('date', { mode: 'string' }).notNull(),
    sessionId: uuid('session_id').references(() => workoutSessions.id, { onDelete: 'set null' }),
    bodyRegion: painRegionEnum('body_region').notNull(),
    intensity: smallint('intensity').notNull(),
    duringExerciseId: uuid('during_exercise_id').references(() => exercises.id, {
      onDelete: 'set null',
    }),
    type: painTypeEnum('type').notNull().default('other'),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (t) => [index('pain_reports_user_date_idx').on(t.userId, t.date)],
);

export type ActivityRow = typeof activities.$inferSelect;
export type DailyCheckinRow = typeof dailyCheckins.$inferSelect;
export type PainReportRow = typeof painReports.$inferSelect;
