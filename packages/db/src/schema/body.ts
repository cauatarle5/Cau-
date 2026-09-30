import { date, doublePrecision, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { createdAt, idColumn, updatedAt } from './columns';
import { bodyFatMethodEnum } from './enums';
import { users } from './users';

export const bodyMeasurements = pgTable(
  'body_measurements',
  {
    id: idColumn(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    measuredAt: timestamp('measured_at', { withTimezone: true }).notNull().defaultNow(),
    /** Dia do usuário (fuso dele). */
    date: date('date', { mode: 'string' }).notNull(),
    weightKg: doublePrecision('weight_kg'),
    bodyFatPct: doublePrecision('body_fat_pct'),
    bodyFatMethod: bodyFatMethodEnum('body_fat_method'),
    waistCm: doublePrecision('waist_cm'),
    hipCm: doublePrecision('hip_cm'),
    chestCm: doublePrecision('chest_cm'),
    armLCm: doublePrecision('arm_l_cm'),
    armRCm: doublePrecision('arm_r_cm'),
    thighLCm: doublePrecision('thigh_l_cm'),
    thighRCm: doublePrecision('thigh_r_cm'),
    calfCm: doublePrecision('calf_cm'),
    neckCm: doublePrecision('neck_cm'),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** Exclusão lógica em registros de histórico. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('body_measurements_user_date_idx').on(t.userId, t.date)],
);

export type BodyMeasurementRow = typeof bodyMeasurements.$inferSelect;
