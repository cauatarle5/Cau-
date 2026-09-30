import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAt, idColumn } from './columns';
import {
  foodBaseUnitEnum,
  foodCategoryEnum,
  foodSourceCodeEnum,
  foodStateEnum,
  householdUnitEnum,
} from './enums';
import { users } from './users';

export const foodSources = pgTable('food_sources', {
  code: foodSourceCodeEnum('code').primaryKey(),
  name: text('name').notNull(),
  licenseNote: text('license_note').notNull(),
});

/** Catálogo global (`user_id` nulo) e alimentos personalizados (DATA_MODEL 4.5). */
export const foods = pgTable(
  'foods',
  {
    id: idColumn(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    sourceCode: foodSourceCodeEnum('source_code').notNull(),
    sourceRef: text('source_ref'),
    namePt: text('name_pt').notNull(),
    nameNormalized: text('name_normalized').notNull(),
    brand: text('brand'),
    category: foodCategoryEnum('category').notNull(),
    state: foodStateEnum('state').notNull(),
    defaultUnit: foodBaseUnitEnum('default_unit').notNull().default('g'),
    densityGPerMl: doublePrecision('density_g_per_ml'),
    isVerified: boolean('is_verified').notNull().default(false),
    barcode: text('barcode'),
    /** Falso quando a receita de origem é excluída (ADR-038): some da busca. */
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index('foods_name_trgm_idx').using('gin', sql`${t.nameNormalized} gin_trgm_ops`),
    index('foods_user_id_idx').on(t.userId),
    // Referência única por fonte (seed idempotente); personalizados têm source_ref nulo.
    uniqueIndex('foods_source_ref_uq').on(t.sourceCode, t.sourceRef),
  ],
);

/** Por 100 g ou 100 ml; ausente = null. */
export const foodNutrients = pgTable('food_nutrients', {
  foodId: uuid('food_id')
    .primaryKey()
    .references(() => foods.id, { onDelete: 'cascade' }),
  kcal: doublePrecision('kcal').notNull(),
  proteinG: doublePrecision('protein_g'),
  carbsG: doublePrecision('carbs_g'),
  fatG: doublePrecision('fat_g'),
  fiberG: doublePrecision('fiber_g'),
  sugarG: doublePrecision('sugar_g'),
  saturatedFatG: doublePrecision('saturated_fat_g'),
  sodiumMg: doublePrecision('sodium_mg'),
  potassiumMg: doublePrecision('potassium_mg'),
  calciumMg: doublePrecision('calcium_mg'),
  ironMg: doublePrecision('iron_mg'),
  cholesterolMg: doublePrecision('cholesterol_mg'),
});

/** Alias global (`user_id` nulo) ou pessoal (aprendido de correções, P6.2 passo 8). */
export const foodAliases = pgTable(
  'food_aliases',
  {
    id: idColumn(),
    foodId: uuid('food_id')
      .notNull()
      .references(() => foods.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    aliasNormalized: text('alias_normalized').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('food_aliases_trgm_idx').using('gin', sql`${t.aliasNormalized} gin_trgm_ops`),
    index('food_aliases_food_idx').on(t.foodId),
  ],
);

export const householdMeasures = pgTable(
  'household_measures',
  {
    id: idColumn(),
    /** Nulo = medida genérica. */
    foodId: uuid('food_id').references(() => foods.id, { onDelete: 'cascade' }),
    /** Nulo = sistema. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    unitCode: householdUnitEnum('unit_code').notNull(),
    labelPt: text('label_pt').notNull(),
    grams: doublePrecision('grams').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('household_measures_food_idx').on(t.foodId),
    index('household_measures_user_idx').on(t.userId),
  ],
);

export const userFoodUsage = pgTable(
  'user_food_usage',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    foodId: uuid('food_id')
      .notNull()
      .references(() => foods.id, { onDelete: 'cascade' }),
    timesUsed: integer('times_used').notNull().default(0),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    lastQuantityG: doublePrecision('last_quantity_g'),
    lastUnitCode: text('last_unit_code'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.foodId] })],
);

export type FoodRow = typeof foods.$inferSelect;
export type FoodNutrientsRow = typeof foodNutrients.$inferSelect;
export type HouseholdMeasureRow = typeof householdMeasures.$inferSelect;
