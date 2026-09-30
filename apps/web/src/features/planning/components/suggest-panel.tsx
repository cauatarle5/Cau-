'use client';

import { useMutation } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { SLOT_LABELS } from '@/features/nutrition/labels';
import { formatNumber } from '@/lib/format';
import { suggestSlot } from '@atlas/core';

import { planningApi } from '../api';
import { usePlanMutation } from '../hooks';

/** "O que comer?": 3 opções do solver com o restante do dia (P7.2). */
export function SuggestPanel({ date }: { date: string }) {
  const suggest = useMutation({ mutationFn: () => planningApi.suggest(date) });
  const slot = suggestSlot(new Date().getHours());
  const plan = usePlanMutation((items: { foodId: string; grams: number }[]) =>
    planningApi.planMeal(
      date,
      slot,
      items.map((i) => ({ foodId: i.foodId, quantity: i.grams, unit: 'g' as const })),
    ),
  );
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
                plan.mutate(o.items.map((i) => ({ foodId: i.food.id, grams: i.grams })));
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
