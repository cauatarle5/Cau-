import { z } from 'zod';

import { dateSchema } from './common';
import { foodSchema, foodUnitSchema, mealSchema, mealSlotSchema, nutrientsSchema } from './food';
import { daySummarySchema } from './nutrition';

// Receitas ----------------------------------------------------------------

export const recipeIngredientInputSchema = z.object({
  foodId: z.uuid(),
  quantity: z.number().positive().max(5000),
  unit: foodUnitSchema.nullable(),
  grams: z.number().positive().max(5000).nullable().optional(),
});

const recipeFields = z.object({
  name: z.string().trim().min(1, { message: 'Informe o nome da receita' }).max(120),
  description: z.string().max(1000).nullable(),
  servings: z.number().min(0.5).max(100),
  cookedWeightG: z.number().positive().max(20_000).nullable(),
  isFavorite: z.boolean(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  instructions: z.string().max(5000).nullable(),
  ingredients: z
    .array(recipeIngredientInputSchema)
    .min(1, { message: 'Adicione ao menos um ingrediente' })
    .max(40),
});
export const recipeInputSchema = recipeFields.extend({
  description: recipeFields.shape.description.optional(),
  servings: recipeFields.shape.servings.default(1),
  cookedWeightG: recipeFields.shape.cookedWeightG.optional(),
  isFavorite: recipeFields.shape.isFavorite.default(false),
  tags: recipeFields.shape.tags.default([]),
  instructions: recipeFields.shape.instructions.optional(),
});
export type RecipeInput = z.input<typeof recipeInputSchema>;
/** Sem defaults: campos ausentes não mudam; `ingredients` substitui a lista. */
export const recipePatchSchema = recipeFields.partial();

export const recipeNutritionSchema = z.object({
  total: nutrientsSchema,
  perServing: nutrientsSchema,
  per100: nutrientsSchema,
  totalGrams: z.number(),
  servingGrams: z.number(),
  cookedBasis: z.boolean(),
});

export const recipeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  servings: z.number(),
  cookedWeightG: z.number().nullable(),
  isFavorite: z.boolean(),
  tags: z.array(z.string()),
  instructions: z.string().nullable(),
  /** Alimento que representa a receita na busca e no registro (ADR-038). */
  foodId: z.uuid().nullable(),
  ingredients: z.array(
    z.object({
      id: z.uuid(),
      foodId: z.uuid(),
      foodName: z.string(),
      quantity: z.number(),
      unitCode: z.string(),
      grams: z.number(),
      nutrients: nutrientsSchema,
    }),
  ),
  nutrition: recipeNutritionSchema,
  createdAt: z.string(),
});
export type RecipeDto = z.infer<typeof recipeSchema>;
export const recipeListSchema = z.object({ items: z.array(recipeSchema) });

// Planejamento ------------------------------------------------------------

export const mealLogSchema = z.object({
  eatenAt: z.iso.datetime({ offset: true }).optional(),
});

export const mealCopySchema = z
  .object({
    toDate: dateSchema,
    fromDate: dateSchema.optional(),
    templateId: z.uuid().optional(),
    /** Só para modelo de refeição: slot de destino (padrão: o do modelo). */
    slot: mealSlotSchema.optional(),
  })
  .refine((v) => (v.fromDate ? 1 : 0) + (v.templateId ? 1 : 0) === 1, {
    message: 'Informe a data de origem ou o modelo',
    path: ['fromDate'],
  });

export const mealTemplateInputSchema = z
  .object({
    name: z.string().trim().min(1, { message: 'Informe o nome do modelo' }).max(80),
    /** Modelo de uma refeição existente... */
    mealId: z.uuid().optional(),
    /** ...ou do dia inteiro (refeições planejadas e registradas). */
    date: dateSchema.optional(),
  })
  .refine((v) => (v.mealId ? 1 : 0) + (v.date ? 1 : 0) === 1, {
    message: 'Informe a refeição ou o dia',
    path: ['mealId'],
  });

export const mealTemplateItemSchema = z.object({
  slot: mealSlotSchema,
  foodId: z.uuid(),
  foodName: z.string(),
  quantity: z.number(),
  unitCode: z.string(),
  grams: z.number(),
});
export const mealTemplateSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slotHint: mealSlotSchema.nullable(),
  items: z.array(mealTemplateItemSchema),
  createdAt: z.string(),
});
export type MealTemplateDto = z.infer<typeof mealTemplateSchema>;
export const mealTemplateListSchema = z.object({ items: z.array(mealTemplateSchema) });
export const mealListResponseSchema = z.object({ items: z.array(mealSchema) });

export const overNutrientSchema = z.enum(['kcal', 'fatG', 'carbsG']);
export const planningAlertSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('over'),
    nutrient: overNutrientSchema,
    forecast: z.number(),
    target: z.number(),
    excess: z.number(),
    itemId: z.uuid().nullable(),
  }),
  z.object({
    kind: z.literal('low'),
    nutrient: z.enum(['proteinG', 'fiberG']),
    forecast: z.number(),
    target: z.number(),
    missing: z.number(),
  }),
]);
export type PlanningAlertDto = z.infer<typeof planningAlertSchema>;
export const dayPlanSchema = z.object({
  summary: daySummarySchema,
  alerts: z.array(planningAlertSchema),
});
export type DayPlanDto = z.infer<typeof dayPlanSchema>;

export const substitutionRequestSchema = z.object({
  itemId: z.uuid(),
  nutrient: overNutrientSchema,
});
export const substitutionSchema = z.object({
  food: foodSchema,
  grams: z.number(),
  nutrients: nutrientsSchema,
  reduction: z.number(),
});
export type SubstitutionDto = z.infer<typeof substitutionSchema>;
export const substitutionListSchema = z.object({
  original: z.object({ foodName: z.string(), grams: z.number(), nutrients: nutrientsSchema }),
  items: z.array(substitutionSchema),
});

const macrosSchema = z.object({
  kcal: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
});
export const suggestMealRequestSchema = z.object({
  date: dateSchema,
  /** Sem valores, usa o restante previsto do dia (meta − consumido − planejado). */
  kcal: z.number().min(0).max(5000).optional(),
  proteinMin: z.number().min(0).max(400).optional(),
  carbsMax: z.number().min(0).max(800).optional(),
  fatMax: z.number().min(0).max(300).optional(),
});
export const suggestMealSchema = z.object({
  constraints: z.object({
    kcal: z.number(),
    proteinMin: z.number(),
    carbsMax: z.number(),
    fatMax: z.number(),
  }),
  options: z.array(
    z.object({
      items: z.array(
        z.object({
          food: foodSchema,
          grams: z.number(),
          nutrients: nutrientsSchema,
        }),
      ),
      totals: macrosSchema,
      remaining: macrosSchema,
    }),
  ),
});
export type SuggestMealDto = z.infer<typeof suggestMealSchema>;

export const complementRequestSchema = z.object({
  date: dateSchema,
  nutrient: z.enum(['proteinG', 'fiberG']),
});
export const complementListSchema = z.object({
  nutrient: z.enum(['proteinG', 'fiberG']),
  missing: z.number(),
  items: z.array(z.object({ food: foodSchema, grams: z.number(), nutrients: nutrientsSchema })),
});
export type ComplementListDto = z.infer<typeof complementListSchema>;
