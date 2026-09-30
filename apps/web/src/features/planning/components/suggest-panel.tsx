'use client';

import { useMutation } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SLOT_LABELS } from '@/features/nutrition/labels';
import { formatNumber } from '@/lib/format';
import { mealSlotSchema, type MealDto, type MealSlot } from '@atlas/schemas';

import { planningApi } from '../api';
import { usePlanMutation } from '../hooks';

/** Adiciona itens ao plano do slot: na refeição planejada que já existe ou numa nova. */
export function usePlanItems(date: string, meals: readonly MealDto[]) {
  return usePlanMutation(
    ({ slot, items }: { slot: MealSlot; items: { foodId: string; grams: number }[] }) => {
      const body = items.map((i) => ({ foodId: i.foodId, quantity: i.grams, unit: 'g' as const }));
      const existing = meals.find((m) => m.slot === slot && m.status === 'planned');
      return existing
        ? planningApi.addItems(existing.id, body)
        : planningApi.planMeal(date, slot, body);
    },
  );
}

/** "O que comer?": 3 opções do solver com o restante do dia (P7.2). */
export function SuggestPanel({
  date,
  meals,
  defaultSlot,
}: {
  date: string;
  meals: readonly MealDto[];
  defaultSlot: MealSlot;
}) {
  const [slot, setSlot] = useState<MealSlot>(defaultSlot);
  const suggest = useMutation({ mutationFn: () => planningApi.suggest(date) });
  const plan = usePlanItems(date, meals);
  const options = suggest.data?.options ?? [];
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <CardTitle>O que comer?</CardTitle>
          <CardDescription>
            Combinações com o que você costuma comer para fechar o dia.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          disabled={suggest.isPending}
          onClick={() => {
            suggest.mutate();
          }}
        >
          <Sparkles className="size-4" aria-hidden />
          Sugerir
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="suggest-slot" className="text-sm text-muted-foreground">
          Refeição
        </Label>
        <Select
          id="suggest-slot"
          className="w-auto"
          value={slot}
          onChange={(e) => {
            setSlot(mealSlotSchema.parse(e.target.value));
          }}
        >
          {mealSlotSchema.options.map((s) => (
            <option key={s} value={s}>
              {SLOT_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>
      {suggest.isSuccess && options.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sem sugestões: registre mais refeições ou favorite receitas para ampliar as opções.
        </p>
      ) : null}
      <ol className="space-y-2" aria-label="Sugestões">
        {options.map((o, idx) => (
          <li key={idx} className="space-y-1 rounded-lg bg-muted p-3 text-sm">
            <p>
              {o.items.map((i) => `${formatNumber(i.grams)} g de ${i.food.namePt}`).join(' + ')}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatNumber(o.totals.kcal)} kcal · P {formatNumber(o.totals.proteinG, 1)} g · C{' '}
              {formatNumber(o.totals.carbsG, 1)} g · G {formatNumber(o.totals.fatG, 1)} g
            </p>
            <Button
              variant="outline"
              disabled={plan.isPending}
              onClick={() => {
                plan.mutate(
                  { slot, items: o.items.map((i) => ({ foodId: i.food.id, grams: i.grams })) },
                  // As opções valiam para o restante anterior: recalcular depois de planejar.
                  {
                    onSuccess: () => {
                      suggest.reset();
                    },
                  },
                );
              }}
            >
              Planejar em {SLOT_LABELS[slot]}
            </Button>
          </li>
        ))}
      </ol>
    </Card>
  );
}
