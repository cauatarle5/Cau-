import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAt, idColumn, updatedAt } from './columns';
import { mealSlotEnum } from './enums';
import { foods } from './foods';
import { users } from './users';

const userRef = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

/** Receita (DATA_MODEL 4.6); `food_id` é o alimento que a representa na busca (ADR-038). */
export const recipes = pgTable(
  'recipes',
  {
    id: idColumn(),
    userId: userRef(),
    name: text('name').notNull(),
    description: text('description'),
    servings: doublePrecision('servings').notNull().default(1),
    cookedWeightG: doublePrecision('cooked_weight_g'),
    isFavorite: boolean('is_favorite').notNull().default(false),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    instructions: text('instructions'),
    foodId: uuid('food_id').references(() => foods.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('recipes_user_idx').on(t.userId)],
);

export const recipeIngredients = pgTable(
  'recipe_ingredients',
  {
    id: idColumn(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    foodId: uuid('food_id')
      .notNull()
      .references(() => foods.id),
    /** Snapshot do nome para exibição. */
    foodName: text('food_name').notNull(),
    quantity: doublePrecision('quantity').notNull(),
    unitCode: text('unit_code').notNull(),
    grams: doublePrecision('grams').notNull(),
    /** Nutrientes do ingrediente no último cálculo (exibição). */
    nutrientsSnapshot: jsonb('nutrients_snapshot')
      .notNull()
      .default(sql`'{}'::jsonb`),
    order: smallint('order').notNull(),
  },
  (t) => [index('recipe_ingredients_recipe_idx').on(t.recipeId)],
);

/** Recalculado a cada alteração da receita (P4.6). */
export const recipeNutritionCache = pgTable('recipe_nutrition_cache', {
  recipeId: uuid('recipe_id')
    .primaryKey()
    .references(() => recipes.id, { onDelete: 'cascade' }),
  total: jsonb('total').notNull(),
  perServing: jsonb('per_serving').notNull(),
  per100g: jsonb('per_100g').notNull(),
  totalGrams: doublePrecision('total_grams').notNull(),
  servingGrams: doublePrecision('serving_grams').notNull(),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Modelo de refeição (`slot_hint`) ou de dia (itens com `slot`), ADR-040. */
export const mealTemplates = pgTable(
  'meal_templates',
  {
    id: idColumn(),
    userId: userRef(),
    name: text('name').notNull(),
    slotHint: mealSlotEnum('slot_hint'),
    items: jsonb('items').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('meal_templates_user_idx').on(t.userId)],
);

export type RecipeRow = typeof recipes.$inferSelect;
export type RecipeIngredientRow = typeof recipeIngredients.$inferSelect;
export type MealTemplateRow = typeof mealTemplates.$inferSelect;
