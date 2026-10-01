import {
  date,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAt, idColumn, updatedAt } from './columns';
import {
  energyConfidenceEnum,
  insightCategoryEnum,
  insightSeverityEnum,
  insightStatusEnum,
} from './enums';
import { users } from './users';

const userRef = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

/** GET adaptativo semanal (DATA_MODEL 4.7, P5.3, ADR-051). */
export const energyEstimates = pgTable(
  'energy_estimates',
  {
    id: idColumn(),
    userId: userRef(),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    tdeeFormula: doublePrecision('tdee_formula').notNull(),
    tdeeObserved: doublePrecision('tdee_observed'),
    tdeeUsed: doublePrecision('tdee_used').notNull(),
    confidence: energyConfidenceEnum('confidence').notNull(),
    weightTrendKg: doublePrecision('weight_trend_kg'),
    intakeAvgKcal: doublePrecision('intake_avg_kcal'),
    loggedDays: smallint('logged_days').notNull(),
    weighInCount: smallint('weigh_in_count').notNull(),
    /** Janela e GET anterior usados no cálculo. */
    inputs: jsonb('inputs').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('energy_estimates_user_week_uq').on(t.userId, t.weekStart)],
);

/** Insights determinísticos (DATA_MODEL 4.8, ADR-050). */
export const insights = pgTable(
  'insights',
  {
    id: idColumn(),
    userId: userRef(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    category: insightCategoryEnum('category').notNull(),
    type: text('type').notNull(),
    /** Chave de deduplicação dentro do tipo. */
    dedupKey: text('dedup_key').notNull(),
    severity: insightSeverityEnum('severity').notNull(),
    titlePt: text('title_pt').notNull(),
    bodyPt: text('body_pt').notNull(),
    data: jsonb('data').notNull(),
    status: insightStatusEnum('status').notNull().default('new'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('insights_user_type_key_uq').on(t.userId, t.type, t.dedupKey),
    index('insights_user_status_idx').on(t.userId, t.status, t.expiresAt),
  ],
);

export type EnergyEstimateRow = typeof energyEstimates.$inferSelect;
export type InsightRow = typeof insights.$inferSelect;
