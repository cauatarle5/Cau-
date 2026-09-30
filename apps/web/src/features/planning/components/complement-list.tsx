'use client';

import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { SLOT_LABELS } from '@/features/nutrition/labels';
import { formatNumber } from '@/lib/format';
import type { MealDto, MealSlot } from '@atlas/schemas';

import { planningApi } from '../api';
import { NUTRIENT_LABELS } from '../labels';

import { usePlanItems } from './suggest-panel';

/** Complemento para proteína ou fibra abaixo da faixa (P7.3). */
export function ComplementList({
  date,
  nutrient,
  meals,
  slot,
}: {
  date: string;
  nutrient: 'proteinG' | 'fiberG';
  meals: readonly MealDto[];
  slot: MealSlot;
}) {
  const list = useQuery({
    queryKey: ['planning', 'complements', date, nutrient],
    queryFn: () => planningApi.complements(date, nutrient),
  });
  const plan = usePlanItems(date, meals);
  if (list.isPending) return <p className="text-xs text-muted-foreground">Buscando opções…</p>;
  const items = list.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <ul className="space-y-1" aria-label={`Complementos de ${NUTRIENT_LABELS[nutrient]}`}>
      {items.map((o) => (
        <li key={o.food.id} className="flex items-center justify-between gap-2 text-xs">
          <span>
            {formatNumber(o.grams)} g de {o.food.namePt} (+
            {formatNumber(o.nutrients[nutrient] ?? 0, 1)} g)
          </span>
          <Button
            variant="ghost"
            className="min-h-8 px-2 text-xs"
            disabled={plan.isPending}
            onClick={() => {
              plan.mutate({ slot, items: [{ foodId: o.food.id, grams: o.grams }] });
            }}
          >
            Planejar em {SLOT_LABELS[slot]}
          </Button>
        </li>
      ))}
    </ul>
  );
}
