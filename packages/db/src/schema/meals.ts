import {
  boolean,
  date,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAt, idColumn, updatedAt } from './columns';
import { dayTypeEnum, mealSlotEnum, mealStatusEnum, targetMethodEnum } from './enums';
import { foods } from './foods';
import { goals } from './profile';
import { users } from './users';

const userRef = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

export const meals = pgTable(
  'meals',
  {
    id: idColumn(),
    userId: userRef(),
    date: date('date', { mode: 'string' }).notNull(),
    slot: mealSlotEnum('slot').notNull(),
    status: mealStatusEnum('status').notNull(),
    eatenAt: timestamp('eaten_at', { withTimezone: true }),
    name: text('name'),
    notes: text('notes'),
    sourceText: text('source_text'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('meals_user_date_idx').on(t.userId, t.date),
    index('meals_user_status_date_idx').on(t.userId, t.status, t.date),
  ],
);

/** Snapshot dos nutrientes no momento do registro (histórico imutável). */
export const mealItems = pgTable(
  'meal_items',
  {
    id: idColumn(),
    mealId: uuid('meal_id')
      .notNull()
      .references(() => meals.id, { onDelete: 'cascade' }),
    foodId: uuid('food_id').references(() => foods.id, { onDelete: 'set null' }),
    /** Receitas entram na Fase 4. */
    recipeId: uuid('recipe_id'),
    foodName: text('food_name').notNull(),
    quantity: doublePrecision('quantity').notNull(),
    unitCode: text('unit_code').notNull(),
    grams: doublePrecision('grams').notNull(),
    nutrientsSnapshot: jsonb('nutrients_snapshot').notNull(),
    parseConfidence: doublePrecision('parse_confidence'),
    createdAt: createdAt(),
  },
  (t) => [index('meal_items_meal_idx').on(t.mealId)],
);

export const waterLogs = pgTable(
  'water_logs',
  {
    id: idColumn(),
    userId: userRef(),
    date: date('date', { mode: 'string' }).notNull(),
    ml: doublePrecision('ml').notNull(),
    loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('water_logs_user_date_idx').on(t.userId, t.date)],
);

/** Snapshot diário das metas (ADR-026). */
export const nutritionTargets = pgTable(
  'nutrition_targets',
  {
    id: idColumn(),
    userId: userRef(),
    date: date('date', { mode: 'string' }).notNull(),
    dayType: dayTypeEnum('day_type').notNull(),
    dayTypeOverridden: boolean('day_type_overridden').notNull().default(false),
    kcal: doublePrecision('kcal').notNull(),
    proteinG: doublePrecision('protein_g').notNull(),
    carbsG: doublePrecision('carbs_g').notNull(),
    fatG: doublePrecision('fat_g').notNull(),
    fiberG: doublePrecision('fiber_g').notNull(),
    waterMl: doublePrecision('water_ml').notNull(),
    method: targetMethodEnum('method').notNull(),
    inputs: jsonb('inputs').notNull(),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('nutrition_targets_user_date_uq').on(t.userId, t.date)],
);

export const parserFeedback = pgTable(
  'parser_feedback',
  {
    id: idColumn(),
    userId: userRef(),
    inputText: text('input_text').notNull(),
    parsed: jsonb('parsed').notNull(),
    corrected: jsonb('corrected').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('parser_feedback_user_idx').on(t.userId)],
);

export type MealRow = typeof meals.$inferSelect;
export type MealItemRow = typeof mealItems.$inferSelect;
export type NutritionTargetRow = typeof nutritionTargets.$inferSelect;
