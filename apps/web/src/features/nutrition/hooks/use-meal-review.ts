'use client';

import { useMemo, useState } from 'react';

import {
  computePortion,
  sumNutrients,
  type FoodUnit,
  type MeasureOption,
  type Nutrients,
} from '@atlas/core';
import type { FoodDto, ParseResponse } from '@atlas/schemas';

export interface ReviewItem {
  key: string;
  query: string;
  quantity: number;
  unit: FoodUnit | null;
  food: FoodDto | null;
  suggestedFoodId: string | null;
  options: FoodDto[];
  confidence: 'auto' | 'review' | 'choose';
  gramsOverride: number | null;
  score: number | null;
}

export interface ReviewedItem extends ReviewItem {
  grams: number | null;
  nutrients: Nutrients | null;
  needsGrams: boolean;
}

const measuresOf = (food: FoodDto): MeasureOption[] =>
  food.measures.map((m) => ({
    unitCode: m.unitCode,
    grams: m.grams,
    isDefault: m.isDefault,
    scope: m.scope,
  }));

/** Estado editável da revisão e totais em tempo real calculados pelo core (P6.2 passo 7). */
export function useMealReview() {
  const [items, setItems] = useState<ReviewItem[]>([]);

  const load = (parsed: ParseResponse) => {
    setItems(
      parsed.items.map((i, idx) => ({
        key: `${String(idx)}-${i.foodQuery}`,
        query: i.foodQuery,
        quantity: i.quantity,
        unit: i.unit,
        food: i.match,
        suggestedFoodId: i.match?.id ?? null,
        options: [...(i.match ? [i.match] : []), ...i.alternatives],
        confidence: i.confidence,
        gramsOverride: null,
        score: i.score,
      })),
    );
  };

  const reviewed: ReviewedItem[] = useMemo(
    () =>
      items.map((item) => {
        if (!item.food) return { ...item, grams: null, nutrients: null, needsGrams: false };
        const r = computePortion(
          item.food,
          measuresOf(item.food),
          item.quantity,
          item.unit,
          item.gramsOverride,
        );
        return r.ok
          ? { ...item, grams: r.grams, nutrients: r.nutrients, needsGrams: false }
          : { ...item, grams: null, nutrients: null, needsGrams: true };
      }),
    [items],
  );

  const totals = useMemo(
    () => sumNutrients(reviewed.flatMap((i) => (i.nutrients ? [i.nutrients] : []))),
    [reviewed],
  );

  const update = (key: string, patch: Partial<ReviewItem>) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  };
  const remove = (key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  };
  const clear = () => {
    setItems([]);
  };

  const ready = reviewed.length > 0 && reviewed.every((i) => i.food && !i.needsGrams);
  return { items: reviewed, totals, load, update, remove, clear, ready };
}
