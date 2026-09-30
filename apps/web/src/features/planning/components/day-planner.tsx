'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useMeals } from '@/features/nutrition/hooks/use-nutrition';
import { ApiError } from '@/lib/api';
import { formatDate, parseDecimal } from '@/lib/format';
import { cn } from '@/lib/utils';
import { addDays, scaleNutrients, type PlanningAlert } from '@atlas/core';
import type { MealSlot } from '@atlas/schemas';

import { planningApi } from '../api';
import {
  forecastPlan,
  useDayPlan,
  useMealTemplates,
  usePlanMutation,
  type DraftItem,
} from '../hooks';
import { PLAN_SLOTS } from '../labels';

import { PlanSlot, type SlotDraft } from './plan-slot';
import { RemainingPanel } from './remaining-panel';
import { SuggestPanel } from './suggest-panel';

function Templates({ date }: { date: string }) {
  const templates = useMealTemplates();
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string>();
  const onError = (err: unknown) => {
    setMessage(err instanceof ApiError ? err.message : 'Não foi possível concluir.');
  };
  const copy = usePlanMutation((body: { fromDate?: string; templateId?: string }) =>
    planningApi.copy({ toDate: date, ...body }),
  );
  const saveDay = usePlanMutation((n: string) => planningApi.saveDay(n, date));
  return (
    <Card className="space-y-3">
      <CardTitle>Modelos</CardTitle>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={copy.isPending}
          onClick={() => {
            copy.mutate(
              { fromDate: addDays(date, -1) },
              {
                onError,
                onSuccess: () => {
                  setMessage('Dia anterior copiado.');
                },
              },
            );
          }}
        >
          Copiar do dia anterior
        </Button>
        {(templates.data?.items ?? []).map((t) => (
          <Button
            key={t.id}
            variant="outline"
            disabled={copy.isPending}
            onClick={() => {
              copy.mutate(
                { templateId: t.id },
                {
                  onError,
                  onSuccess: () => {
                    setMessage(`Modelo “${t.name}” aplicado.`);
                  },
                },
              );
            }}
          >
            Aplicar “{t.name}”
          </Button>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <Input
          aria-label="Nome do modelo"
          placeholder="ex.: Dia de treino"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
        <Button
          disabled={!name.trim() || saveDay.isPending}
          onClick={() => {
            saveDay.mutate(name.trim(), {
              onError,
              onSuccess: () => {
                setMessage('Dia salvo como modelo.');
                setName('');
              },
            });
          }}
        >
          Salvar dia
        </Button>
      </div>
      {message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
    </Card>
  );
}

/** Planejamento do dia (P7.3/P12.5): slots, restante ao vivo, alertas e trocas. */
export function DayPlanner({ today }: { today: string }) {
  const [date, setDate] = useState(today);
  const plan = useDayPlan(date);
  const meals = useMeals(date);
  const [overrides, setOverrides] = useState<Map<string, number>>(new Map());
  const [drafts, setDrafts] = useState<Partial<Record<MealSlot, SlotDraft | null>>>({});

  const dayMeals = meals.data?.items ?? [];
  const draftItems: DraftItem[] = Object.entries(drafts).flatMap(([slot, d]) => {
    const grams = d ? parseDecimal(d.grams) : null;
    return d && grams && grams > 0
      ? [
          {
            id: `draft-${slot}`,
            foodName: d.food.namePt,
            nutrients: scaleNutrients(d.food.per100, grams),
          },
        ]
      : [];
  });
  const f = forecastPlan(plan.data, dayMeals, overrides, draftItems);
  const overAlerts = f.alerts.filter(
    (a): a is Extract<PlanningAlert, { kind: 'over' }> => a.kind === 'over',
  );
  const slots = [
    ...PLAN_SLOTS,
    ...dayMeals.map((m) => m.slot).filter((s) => !(PLAN_SLOTS as readonly string[]).includes(s)),
  ].filter((s, i, list) => list.indexOf(s) === i);

  return (
    <div className="space-y-4">
      <div className="flex gap-2" role="group" aria-label="Dia do plano">
        {[
          { d: today, label: 'Hoje' },
          { d: addDays(today, 1), label: 'Amanhã' },
        ].map((o) => (
          <Button
            key={o.d}
            variant={date === o.d ? 'default' : 'outline'}
            aria-pressed={date === o.d}
            onClick={() => {
              setDate(o.d);
              setOverrides(new Map());
              setDrafts({});
            }}
          >
            {o.label} · {formatDate(o.d).slice(0, 5)}
          </Button>
        ))}
      </div>

      {plan.data && !plan.data.summary.targets ? (
        <p className="text-sm text-muted-foreground">
          Complete o perfil e o objetivo para ver metas e alertas do plano.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className={cn('space-y-3', meals.isPending && 'opacity-60')}>
          {slots.map((slot) => (
            <PlanSlot
              key={`${date}-${slot}`}
              date={date}
              slot={slot}
              meals={dayMeals.filter((m) => m.slot === slot && m.items.length > 0)}
              overrides={overrides}
              onOverride={(itemId, grams) => {
                setOverrides((prev) => {
                  const next = new Map(prev);
                  if (grams === null) next.delete(itemId);
                  else next.set(itemId, grams);
                  return next;
                });
              }}
              draft={drafts[slot] ?? null}
              onDraft={(d) => {
                setDrafts((prev) => ({ ...prev, [slot]: d }));
              }}
              alerts={overAlerts}
            />
          ))}
        </div>
        <div className="space-y-4">
          <SuggestPanel date={date} />
          <Templates date={date} />
        </div>
      </div>

      {f.targets && f.remaining ? (
        <RemainingPanel
          targets={f.targets}
          consumed={f.consumed}
          planned={f.planned}
          remaining={f.remaining}
          alerts={f.alerts}
        />
      ) : null}
    </div>
  );
}
