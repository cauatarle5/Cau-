import { apiRequest } from '@/lib/api';
import {
  dayPlanSchema,
  mealListResponseSchema,
  mealSchema,
  mealTemplateListSchema,
  mealTemplateSchema,
  substitutionListSchema,
  suggestMealSchema,
  type MealItemInput,
  type MealSlot,
} from '@atlas/schemas';

export const planningApi = {
  dayPlan: (date: string) => apiRequest(`/nutrition/day-plan?date=${date}`, dayPlanSchema),
  planMeal: (date: string, slot: MealSlot, items: MealItemInput[]) =>
    apiRequest('/meals', mealSchema, {
      method: 'POST',
      body: { date, slot, status: 'planned', items },
    }),
  addItems: (mealId: string, items: MealItemInput[]) =>
    apiRequest(`/meals/${mealId}/items`, mealSchema, { method: 'POST', body: { items } }),
  updateItem: (itemId: string, body: { foodId?: string; quantity: number; unit: 'g' }) =>
    apiRequest(`/meal-items/${itemId}`, mealSchema, { method: 'PATCH', body }),
  logMeal: (mealId: string) =>
    apiRequest(`/meals/${mealId}/log`, mealSchema, { method: 'POST', body: {} }),
  copy: (body: { toDate: string; fromDate?: string; templateId?: string }) =>
    apiRequest('/meals/copy', mealListResponseSchema, { method: 'POST', body }),
  templates: () => apiRequest('/meal-templates', mealTemplateListSchema),
  saveDay: (name: string, date: string) =>
    apiRequest('/meal-templates', mealTemplateSchema, { method: 'POST', body: { name, date } }),
  substitutions: (itemId: string, nutrient: 'kcal' | 'fatG' | 'carbsG') =>
    apiRequest('/nutrition/substitutions', substitutionListSchema, {
      method: 'POST',
      body: { itemId, nutrient },
    }),
  suggest: (date: string) =>
    apiRequest('/nutrition/suggest-meal', suggestMealSchema, { method: 'POST', body: { date } }),
};
