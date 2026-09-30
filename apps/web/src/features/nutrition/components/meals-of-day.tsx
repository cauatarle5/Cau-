'use client';

import { Trash2 } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { formatNumber } from '@/lib/format';
import type { MealDto } from '@atlas/schemas';

import { useDeleteMealItem, useMeals } from '../hooks/use-nutrition';
import { SLOT_LABELS } from '../labels';

function MealCard({ meal }: { meal: MealDto }) {
  const remove = useDeleteMealItem();
  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-baseline justify-between">
        <CardTitle className="text-base">{SLOT_LABELS[meal.slot]}</CardTitle>
        <span className="text-sm tabular-nums text-muted-foreground">
          {formatNumber(meal.totals.kcal ?? 0)} kcal
        </span>
      </div>
      <ul className="divide-y divide-border text-sm">
        {meal.items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-2 py-1.5">
            <span className="min-w-0 flex-1 truncate">{i.foodName}</span>
            <span className="tabular-nums text-muted-foreground">{formatNumber(i.grams)} g</span>
            <span className="w-16 text-right tabular-nums">
              {formatNumber(i.nutrients.kcal ?? 0)} kcal
            </span>
            <Button
              type="button"
              variant="ghost"
              aria-label={`Remover ${i.foodName}`}
              onClick={() => {
                remove.mutate(i.id);
              }}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function MealsOfDay({ date }: { date: string }) {
  const meals = useMeals(date);
  const logged = (meals.data?.items ?? []).filter(
    (m) => m.status === 'logged' && m.items.length > 0,
  );
  if (meals.isPending)
    return <div className="h-24 animate-pulse rounded-xl bg-muted" aria-busy="true" />;
  if (logged.length === 0) {
    return (
      <EmptyState title="Nenhuma refeição registrada hoje">
        Digite o que você comeu em texto livre, como “2 ovos e 1 pão francês”.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-3">
      {logged.map((m) => (
        <MealCard key={m.id} meal={m} />
      ))}
    </div>
  );
}
