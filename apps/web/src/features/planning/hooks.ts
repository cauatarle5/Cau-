'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { mealKeys } from '@/features/nutrition/hooks/use-nutrition';
import { nutritionKeys } from '@/features/nutrition/hooks/use-targets';
import {
  forecastTotals,
  planningAlerts,
  remainingTargets,
  rescaleNutrients,
  type Nutrients,
  type PlannedItemLike,
} from '@atlas/core';
import type { DayPlanDto, MealDto } from '@atlas/schemas';

import { planningApi } from './api';

export const planningKeys = {
  day: (date: string) => ['planning', 'day', date] as const,
  templates: ['planning', 'templates'] as const,
};

export const useDayPlan = (date: string) =>
  useQuery({ queryKey: planningKeys.day(date), queryFn: () => planningApi.dayPlan(date) });

export const useMealTemplates = () =>
  useQuery({ queryKey: planningKeys.templates, queryFn: planningApi.templates });

/** Toda mudança no plano invalida plano, refeições e resumo do dia. */
export function useInvalidatePlan() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['planning'] }),
      qc.invalidateQueries({ queryKey: mealKeys.all }),
      qc.invalidateQueries({ queryKey: nutritionKeys.all }),
    ]);
}

export function usePlanMutation<T>(fn: (arg: T) => Promise<unknown>) {
  const invalidate = useInvalidatePlan();
  return useMutation({ mutationFn: fn, onSuccess: invalidate });
}

/** Item ainda não salvo (digitando), já com nutrientes calculados. */
export interface DraftItem {
  id: string;
  foodName: string;
  nutrients: Nutrients;
}

/**
 * Previsão ao vivo (P7.3, cálculo no cliente pelo core): consumido + planejado (com gramas
 * editadas e rascunhos), restante e alertas.
 */
export function forecastPlan(
  plan: DayPlanDto | undefined,
  meals: readonly MealDto[],
  gramsOverride: ReadonlyMap<string, number>,
  drafts: readonly DraftItem[],
) {
  const planned: PlannedItemLike[] = [
    ...meals
      .filter((m) => m.status === 'planned')
      .flatMap((m) =>
        m.items.map((i) => {
          const g = gramsOverride.get(i.id);
          return {
            id: i.id,
            foodName: i.foodName,
            nutrients: g === undefined ? i.nutrients : rescaleNutrients(i.nutrients, i.grams, g),
          };
        }),
      ),
    ...drafts,
  ];
  const targets = plan?.summary.targets ?? null;
  const consumed = plan?.summary.consumed ?? {
    kcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
    waterMl: 0,
  };
  const nutrients = planned.map((p) => p.nutrients);
  const forecast = forecastTotals(consumed, nutrients);
  const plannedOnly = forecastTotals(
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
    nutrients,
  );
  return {
    targets,
    consumed,
    planned: plannedOnly,
    remaining: targets
      ? remainingTargets(targets, { ...forecast, waterMl: consumed.waterMl })
      : null,
    alerts: targets ? planningAlerts(targets, consumed, planned) : [],
  };
}
