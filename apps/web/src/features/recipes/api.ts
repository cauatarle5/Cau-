import { apiRequest } from '@/lib/api';
import {
  mealSchema,
  recipeListSchema,
  recipeSchema,
  type MealSlot,
  type RecipeInput,
} from '@atlas/schemas';

export const recipesApi = {
  list: () => apiRequest('/recipes', recipeListSchema),
  create: (input: RecipeInput) =>
    apiRequest('/recipes', recipeSchema, { method: 'POST', body: input }),
  update: (id: string, body: Partial<RecipeInput>) =>
    apiRequest(`/recipes/${id}`, recipeSchema, { method: 'PATCH', body }),
  duplicate: (id: string) =>
    apiRequest(`/recipes/${id}/duplicate`, recipeSchema, { method: 'POST' }),
  remove: (id: string) => apiRequest(`/recipes/${id}`, null, { method: 'DELETE' }),
  logPortion: (date: string, slot: MealSlot, foodId: string, portions: number) =>
    apiRequest('/meals', mealSchema, {
      method: 'POST',
      body: { date, slot, items: [{ foodId, quantity: portions, unit: 'portion' }] },
    }),
};
