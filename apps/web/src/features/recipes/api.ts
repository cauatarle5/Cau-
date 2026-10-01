import { apiRequest } from '@/lib/api';
import type { mealSchema, recipeListSchema, recipeSchema } from '@atlas/schemas';
import { type MealSlot, type RecipeInput } from '@atlas/schemas';

export const recipesApi = {
  list: () => apiRequest<typeof recipeListSchema>('/recipes'),
  create: (input: RecipeInput) =>
    apiRequest<typeof recipeSchema>('/recipes', { method: 'POST', body: input }),
  update: (id: string, body: Partial<RecipeInput>) =>
    apiRequest<typeof recipeSchema>(`/recipes/${id}`, { method: 'PATCH', body }),
  duplicate: (id: string) =>
    apiRequest<typeof recipeSchema>(`/recipes/${id}/duplicate`, { method: 'POST' }),
  remove: (id: string) => apiRequest<null>(`/recipes/${id}`, { method: 'DELETE' }),
  logPortion: (date: string, slot: MealSlot, foodId: string, portions: number) =>
    apiRequest<typeof mealSchema>('/meals', {
      method: 'POST',
      body: { date, slot, items: [{ foodId, quantity: portions, unit: 'portion' }] },
    }),
};
