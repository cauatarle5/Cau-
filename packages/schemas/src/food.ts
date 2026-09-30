import { z } from 'zod';

import { dateSchema } from './common';

export const massUnits = ['g', 'kg', 'ml', 'l'] as const;
export const householdUnits = [
  'unit',
  'slice',
  'tbsp',
  'tsp',
  'cup',
  'scoop',
  'ladle',
  'portion',
  'pinch',
  'glass',
  'can',
  'small',
  'medium',
  'large',
] as const;
export const foodUnitSchema = z.enum([...massUnits, ...householdUnits]);
export const householdUnitSchema = z.enum(householdUnits);
export type FoodUnitDto = z.infer<typeof foodUnitSchema>;

export const foodCategorySchema = z.enum([
  'cereals',
  'legumes',
  'meats',
  'poultry',
  'fish',
  'eggs',
  'dairy',
  'fruits',
  'vegetables',
  'tubers',
  'fats_oils',
  'sweets',
  'beverages',
  'supplements',
  'prepared',
  'other',
]);

const n = z.number().nullable();
/** Nutrientes (por 100 g/ml no catálogo, ou do item no snapshot). */
export const nutrientsSchema = z.object({
  kcal: n,
  proteinG: n,
  carbsG: n,
  fatG: n,
  fiberG: n,
  sugarG: n,
  saturatedFatG: n,
  sodiumMg: n,
  potassiumMg: n,
  calciumMg: n,
  ironMg: n,
  cholesterolMg: n,
});
export type NutrientsDto = z.infer<typeof nutrientsSchema>;

export const measureSchema = z.object({
  unitCode: householdUnitSchema,
  labelPt: z.string(),
  grams: z.number(),
  isDefault: z.boolean(),
  scope: z.enum(['food', 'user', 'generic']),
});

export const foodSchema = z.object({
  id: z.uuid(),
  namePt: z.string(),
  brand: z.string().nullable(),
  category: foodCategorySchema,
  state: z.enum(['raw', 'cooked', 'grilled', 'fried', 'boiled', 'roasted', 'ready']),
  sourceCode: z.enum(['taco', 'tbca', 'usda', 'off', 'user', 'recipe']),
  isCustom: z.boolean(),
  isVerified: z.boolean(),
  defaultUnit: z.enum(['g', 'ml']),
  per100: nutrientsSchema,
  measures: z.array(measureSchema),
});
export type FoodDto = z.infer<typeof foodSchema>;

export const foodSearchQuerySchema = z.object({
  q: z.string().trim().min(1, { message: 'Digite o que procura' }).max(100),
  limit: z.coerce.number().int().min(1).max(30).default(10),
});
export const foodSearchResponseSchema = z.object({
  items: z.array(foodSchema.extend({ score: z.number() })),
});

const nonNegative = (label: string) =>
  z
    .number({ message: `${label} deve ser um número` })
    .min(0)
    .max(5000);

/** Alimento personalizado (P6.3): valores da porção de referência (ex.: rótulo) → por 100. */
export const customFoodInputSchema = z.object({
  namePt: z.string().trim().min(1, { message: 'Informe o nome' }).max(120),
  brand: z.string().trim().max(60).nullable().optional(),
  category: foodCategorySchema.default('other'),
  referenceAmount: z.number().positive().max(5000),
  referenceUnit: z.enum(['g', 'ml']).default('g'),
  kcal: nonNegative('Calorias'),
  proteinG: nonNegative('Proteína'),
  carbsG: nonNegative('Carboidrato'),
  fatG: nonNegative('Gordura'),
  fiberG: nonNegative('Fibra').nullable().optional(),
  sugarG: nonNegative('Açúcar').nullable().optional(),
  saturatedFatG: nonNegative('Gordura saturada').nullable().optional(),
  sodiumMg: z.number().min(0).max(100000).nullable().optional(),
  measures: z
    .array(
      z.object({
        unitCode: householdUnitSchema,
        labelPt: z.string().trim().min(1).max(60),
        grams: z.number().positive().max(5000),
      }),
    )
    .max(10)
    .default([]),
});
export type CustomFoodInput = z.input<typeof customFoodInputSchema>;

export const measureInputSchema = z.object({
  unitCode: householdUnitSchema,
  labelPt: z.string().trim().min(1).max(60),
  grams: z.number().positive().max(5000),
});

// Parser ----------------------------------------------------------------------

export const parseRequestSchema = z.object({
  text: z.string().trim().min(1, { message: 'Descreva o que comeu' }).max(1000),
});

export const parsedItemSchema = z.object({
  raw: z.string(),
  foodQuery: z.string(),
  quantity: z.number(),
  unit: foodUnitSchema.nullable(),
  preparation: z.string().nullable(),
  match: foodSchema.nullable(),
  score: z.number().nullable(),
  confidence: z.enum(['auto', 'review', 'choose']),
  alternatives: z.array(foodSchema),
  grams: z.number().nullable(),
  densityAssumed: z.boolean(),
  nutrients: nutrientsSchema.nullable(),
  error: z.enum(['FOOD_NOT_FOUND', 'UNIT_NOT_CONVERTIBLE']).nullable(),
});
export type ParsedItemDto = z.infer<typeof parsedItemSchema>;

export const parseResponseSchema = z.object({
  source: z.enum(['ai', 'rules']),
  items: z.array(parsedItemSchema),
  totals: nutrientsSchema,
});
export type ParseResponse = z.infer<typeof parseResponseSchema>;

// Refeições -------------------------------------------------------------------

export const mealSlotSchema = z.enum([
  'breakfast',
  'morning_snack',
  'lunch',
  'afternoon_snack',
  'pre_workout',
  'post_workout',
  'dinner',
  'supper',
  'other',
]);
export type MealSlot = z.infer<typeof mealSlotSchema>;

export const mealItemInputSchema = z.object({
  foodId: z.uuid(),
  quantity: z.number().positive().max(5000),
  unit: foodUnitSchema.nullable(),
  /** Gramas informados pelo usuário quando a unidade não converte (P6.2 passo 5). */
  grams: z.number().positive().max(5000).nullable().optional(),
  /** Termo digitado e alimento sugerido pelo parser: alimentam o aprendizado (P6.2 passo 8). */
  query: z.string().max(120).nullable().optional(),
  suggestedFoodId: z.uuid().nullable().optional(),
  parseConfidence: z.number().min(0).max(1).nullable().optional(),
});
export type MealItemInput = z.input<typeof mealItemInputSchema>;

export const mealCreateSchema = z.object({
  date: dateSchema,
  slot: mealSlotSchema,
  status: z.enum(['planned', 'logged']).default('logged'),
  eatenAt: z.iso.datetime({ offset: true }).nullable().optional(),
  name: z.string().trim().max(80).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  sourceText: z.string().max(1000).nullable().optional(),
  items: z.array(mealItemInputSchema).min(1, { message: 'Adicione ao menos um alimento' }).max(30),
});
export type MealCreateInput = z.input<typeof mealCreateSchema>;

export const mealPatchSchema = z.object({
  date: dateSchema.optional(),
  slot: mealSlotSchema.optional(),
  eatenAt: z.iso.datetime({ offset: true }).nullable().optional(),
  name: z.string().trim().max(80).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const mealItemPatchSchema = z.object({
  foodId: z.uuid().optional(),
  quantity: z.number().positive().max(5000).optional(),
  unit: foodUnitSchema.nullable().optional(),
  grams: z.number().positive().max(5000).nullable().optional(),
});

export const mealItemSchema = z.object({
  id: z.uuid(),
  foodId: z.uuid().nullable(),
  foodName: z.string(),
  quantity: z.number(),
  unitCode: z.string(),
  grams: z.number(),
  nutrients: nutrientsSchema,
  parseConfidence: z.number().nullable(),
});

export const mealSchema = z.object({
  id: z.uuid(),
  date: z.string(),
  slot: mealSlotSchema,
  status: z.enum(['planned', 'logged']),
  eatenAt: z.string().nullable(),
  name: z.string().nullable(),
  notes: z.string().nullable(),
  sourceText: z.string().nullable(),
  items: z.array(mealItemSchema),
  totals: nutrientsSchema,
});
export type MealDto = z.infer<typeof mealSchema>;

export const mealListQuerySchema = z.object({ date: dateSchema });
export const mealListSchema = z.object({ items: z.array(mealSchema) });

// Água ------------------------------------------------------------------------

export const waterLogInputSchema = z.object({
  date: dateSchema,
  ml: z.number().int().min(1, { message: 'Informe a quantidade' }).max(5000),
});
export const waterLogSchema = z.object({
  id: z.uuid(),
  date: z.string(),
  ml: z.number(),
  loggedAt: z.string(),
});
