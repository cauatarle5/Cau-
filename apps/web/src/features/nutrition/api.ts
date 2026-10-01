import { apiRequest } from '@/lib/api';
import type {
  daySummarySchema,
  foodSchema,
  foodSearchResponseSchema,
  mealListSchema,
  mealSchema,
  parseResponseSchema,
  targetsResponseSchema,
  waterLogSchema,
} from '@atlas/schemas';
import { type CustomFoodInput, type DayTypeDto, type MealCreateInput } from '@atlas/schemas';

export const nutritionApi = {
  targets: (from: string, to: string) =>
    apiRequest<typeof targetsResponseSchema>(`/nutrition/targets?from=${from}&to=${to}`),
  setDayType: (date: string, dayType: DayTypeDto) =>
    apiRequest<typeof targetsResponseSchema>(`/nutrition/targets/${date}/day-type`, {
      method: 'PUT',
      body: { dayType },
    }),
  summary: (date: string) =>
    apiRequest<typeof daySummarySchema>(`/nutrition/day-summary?date=${date}`),
  parse: (text: string) =>
    apiRequest<typeof parseResponseSchema>('/nutrition/parse', { method: 'POST', body: { text } }),
  meals: (date: string) => apiRequest<typeof mealListSchema>(`/meals?date=${date}`),
  createMeal: (input: MealCreateInput) =>
    apiRequest<typeof mealSchema>('/meals', { method: 'POST', body: input }),
  deleteItem: (id: string) => apiRequest<null>(`/meal-items/${id}`, { method: 'DELETE' }),
  addWater: (date: string, ml: number) =>
    apiRequest<typeof waterLogSchema>('/water-logs', { method: 'POST', body: { date, ml } }),
  searchFoods: (q: string) =>
    apiRequest<typeof foodSearchResponseSchema>(`/foods/search?q=${encodeURIComponent(q)}&limit=8`),
  createFood: (input: CustomFoodInput) =>
    apiRequest<typeof foodSchema>('/foods', { method: 'POST', body: input }),
};
