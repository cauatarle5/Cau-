import { apiRequest } from '@/lib/api';
import type {
  complementListSchema,
  dayPlanSchema,
  mealListResponseSchema,
  mealSchema,
  mealTemplateListSchema,
  mealTemplateSchema,
  substitutionListSchema,
  suggestMealSchema,
} from '@atlas/schemas';
import { type MealItemInput, type MealSlot } from '@atlas/schemas';

export const planningApi = {
  dayPlan: (date: string) => apiRequest<typeof dayPlanSchema>(`/nutrition/day-plan?date=${date}`),
  planMeal: (date: string, slot: MealSlot, items: MealItemInput[]) =>
    apiRequest<typeof mealSchema>('/meals', {
      method: 'POST',
      body: { date, slot, status: 'planned', items },
    }),
  addItems: (mealId: string, items: MealItemInput[]) =>
    apiRequest<typeof mealSchema>(`/meals/${mealId}/items`, { method: 'POST', body: { items } }),
  updateItem: (itemId: string, body: { foodId?: string; quantity: number; unit: 'g' }) =>
    apiRequest<typeof mealSchema>(`/meal-items/${itemId}`, { method: 'PATCH', body }),
  logMeal: (mealId: string) =>
    apiRequest<typeof mealSchema>(`/meals/${mealId}/log`, { method: 'POST', body: {} }),
  copy: (body: { toDate: string; fromDate?: string; templateId?: string }) =>
    apiRequest<typeof mealListResponseSchema>('/meals/copy', { method: 'POST', body }),
  templates: () => apiRequest<typeof mealTemplateListSchema>('/meal-templates'),
  saveDay: (name: string, date: string) =>
    apiRequest<typeof mealTemplateSchema>('/meal-templates', {
      method: 'POST',
      body: { name, date },
    }),
  substitutions: (itemId: string, nutrient: 'kcal' | 'fatG' | 'carbsG') =>
    apiRequest<typeof substitutionListSchema>('/nutrition/substitutions', {
      method: 'POST',
      body: { itemId, nutrient },
    }),
  complements: (date: string, nutrient: 'proteinG' | 'fiberG') =>
    apiRequest<typeof complementListSchema>('/nutrition/complements', {
      method: 'POST',
      body: { date, nutrient },
    }),
  suggest: (date: string) =>
    apiRequest<typeof suggestMealSchema>('/nutrition/suggest-meal', {
      method: 'POST',
      body: { date },
    }),
};
