'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CustomFoodInput, DayTypeDto, MealCreateInput } from '@atlas/schemas';

import { nutritionApi } from '../api';

import { nutritionKeys } from './use-targets';

export const mealKeys = {
  all: ['meals'] as const,
  day: (date: string) => ['meals', date] as const,
};

export const useDaySummary = (date: string) =>
  useQuery({
    queryKey: [...nutritionKeys.all, 'summary', date],
    queryFn: () => nutritionApi.summary(date),
  });

export const useMeals = (date: string) =>
  useQuery({ queryKey: mealKeys.day(date), queryFn: () => nutritionApi.meals(date) });

export const useFoodSearch = (q: string) =>
  useQuery({
    queryKey: ['foods', 'search', q],
    queryFn: () => nutritionApi.searchFoods(q),
    enabled: q.trim().length >= 2,
    placeholderData: keepPreviousData,
  });

/** Registrar/alterar refeições muda o resumo do dia e a lista. */
function useInvalidateDay() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: nutritionKeys.all }),
      qc.invalidateQueries({ queryKey: mealKeys.all }),
      // Contexto do dia (sinais) depende do consumido.
      qc.invalidateQueries({ queryKey: ['insights'] }),
    ]);
}

export const useParseMeal = () =>
  useMutation({ mutationFn: (text: string) => nutritionApi.parse(text) });

export function useCreateMeal() {
  const invalidate = useInvalidateDay();
  return useMutation({
    mutationFn: (input: MealCreateInput) => nutritionApi.createMeal(input),
    onSuccess: invalidate,
  });
}

export function useDeleteMealItem() {
  const invalidate = useInvalidateDay();
  return useMutation({
    mutationFn: (id: string) => nutritionApi.deleteItem(id),
    onSuccess: invalidate,
  });
}

export function useAddWater() {
  const invalidate = useInvalidateDay();
  return useMutation({
    mutationFn: ({ date, ml }: { date: string; ml: number }) => nutritionApi.addWater(date, ml),
    onSuccess: invalidate,
  });
}

export function useSetDayType() {
  const invalidate = useInvalidateDay();
  return useMutation({
    mutationFn: ({ date, dayType }: { date: string; dayType: DayTypeDto }) =>
      nutritionApi.setDayType(date, dayType),
    onSuccess: invalidate,
  });
}

export const useCreateFood = () =>
  useMutation({ mutationFn: (input: CustomFoodInput) => nutritionApi.createFood(input) });
