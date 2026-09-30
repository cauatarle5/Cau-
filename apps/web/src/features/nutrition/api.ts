import { apiRequest } from '@/lib/api';
import {
  daySummarySchema,
  foodSchema,
  foodSearchResponseSchema,
  mealListSchema,
  mealSchema,
  parseResponseSchema,
  targetsResponseSchema,
  waterLogSchema,
  type CustomFoodInput,
  type DayTypeDto,
  type MealCreateInput,
} from '@atlas/schemas';

export const nutritionApi = {
  targets: (from: string, to: string) =>
    apiRequest(`/nutrition/targets?from=${from}&to=${to}`, targetsResponseSchema),
  setDayType: (date: string, dayType: DayTypeDto) =>
    apiRequest(`/nutrition/targets/${date}/day-type`, targetsResponseSchema, {
      method: 'PUT',
      body: { dayType },
    }),
  summary: (date: string) => apiRequest(`/nutrition/day-summary?date=${date}`, daySummarySchema),
  parse: (text: string) =>
    apiRequest('/nutrition/parse', parseResponseSchema, { method: 'POST', body: { text } }),
  meals: (date: string) => apiRequest(`/meals?date=${date}`, mealListSchema),
  createMeal: (input: MealCreateInput) =>
    apiRequest('/meals', mealSchema, { method: 'POST', body: input }),
  deleteItem: (id: string) => apiRequest(`/meal-items/${id}`, null, { method: 'DELETE' }),
  addWater: (date: string, ml: number) =>
    apiRequest('/water-logs', waterLogSchema, { method: 'POST', body: { date, ml } }),
  searchFoods: (q: string) =>
    apiRequest(`/foods/search?q=${encodeURIComponent(q)}&limit=8`, foodSearchResponseSchema),
  createFood: (input: CustomFoodInput) =>
    apiRequest('/foods', foodSchema, { method: 'POST', body: input }),
};
