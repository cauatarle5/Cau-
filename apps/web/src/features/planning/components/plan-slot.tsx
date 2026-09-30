'use client';

import { AlertTriangle, Check } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useFoodSearch } from '@/features/nutrition/hooks/use-nutrition';
import { SLOT_LABELS } from '@/features/nutrition/labels';
import { formatInputNumber, formatNumber, parseDecimal } from '@/lib/format';
import type { PlanningAlert } from '@atlas/core';
import type { FoodDto, MealDto, MealSlot } from '@atlas/schemas';

import { planningApi } from '../api';
import { usePlanMutation } from '../hooks';
import { NUTRIENT_LABELS } from '../labels';

import { SubstitutionList } from './substitution-list';

export interface SlotDraft {
  food: FoodDto;
  grams: string;
}

type OverAlert = Extract<PlanningAlert, { kind: 'over' }>;

/** Gramas com rascunho de texto: o total muda a cada tecla; salva ao sair do campo. */
function GramsInput({
  label,
  grams,
  onLive,
  onCommit,
}: {
  label: string;
  grams: number;
  onLive: (grams: number) => void;
  onCommit: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-1">
      <Input
        aria-label={label}
        inputMode="decimal"
        className="h-9 w-20 text-right"
        value={text ?? formatInputNumber(grams, 1)}
        onChange={(e) => {
          setText(e.target.value);
          const g = parseDecimal(e.target.value);
          if (g !== null && g > 0) onLive(g);
        }}
        onBlur={() => {
          setText(null);
          onCommit();
        }}
      />
      <span className="text-xs text-muted-foreground">g</span>
    </span>
  );
}

function ItemAlert({ alert, itemId }: { alert: OverAlert; itemId: string }) {
  const [open, setOpen] = useState(false);
  const unit = alert.nutrient === 'kcal' ? 'kcal' : 'g';
  return (
    <div
      className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
      role="status"
      data-testid="item-alert"
    >
      <p className="flex items-start gap-1.5">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        Com este item, o dia passa a meta de {NUTRIENT_LABELS[alert.nutrient]} em{' '}
        {formatNumber(alert.excess, alert.nutrient === 'kcal' ? 0 : 1)} {unit}.
      </p>
      {itemId.startsWith('draft-') ? (
        <p className="text-xs">Adicione ao plano para ver trocas.</p>
      ) : open ? (
        <SubstitutionList
          itemId={itemId}
          nutrient={alert.nutrient}
          onDone={() => {
            setOpen(false);
          }}
        />
      ) : (
        <Button
          variant="outline"
          onClick={() => {
            setOpen(true);
          }}
        >
          Ver trocas
        </Button>
      )}
    </div>
  );
}

/** Um slot do dia: itens planejados (gramas editáveis), registrados e busca para adicionar. */
export function PlanSlot({
  date,
  slot,
  meals,
  overrides,
  onOverride,
  draft,
  onDraft,
  alerts,
}: {
  date: string;
  slot: MealSlot;
  meals: MealDto[];
  overrides: ReadonlyMap<string, number>;
  onOverride: (itemId: string, grams: number | null) => void;
  draft: SlotDraft | null;
  onDraft: (draft: SlotDraft | null) => void;
  alerts: OverAlert[];
}) {
  const [q, setQ] = useState('');
  const search = useFoodSearch(q);
  const label = SLOT_LABELS[slot];
  const planned = meals.find((m) => m.status === 'planned');
  const save = usePlanMutation(async (d: SlotDraft) => {
    const grams = parseDecimal(d.grams) ?? 0;
    const items = [{ foodId: d.food.id, quantity: grams, unit: 'g' as const }];
    return planned
      ? planningApi.addItems(planned.id, items)
      : planningApi.planMeal(date, slot, items);
  });
  const update = usePlanMutation((v: { itemId: string; grams: number }) =>
    planningApi.updateItem(v.itemId, { quantity: v.grams, unit: 'g' }),
  );
  const log = usePlanMutation((mealId: string) => planningApi.logMeal(mealId));
  const alertFor = (id: string) => alerts.find((a) => a.itemId === id);
  const draftId = `draft-${slot}`;
  const draftAlert = alertFor(draftId);

  return (
    <Card className="space-y-3 p-4" role="region" aria-label={label}>
      <div className="flex items-center justify-between gap-2">
        <CardTitle className="text-base">{label}</CardTitle>
        {planned && planned.items.length > 0 ? (
          <Button
            variant="outline"
            disabled={log.isPending}
            onClick={() => {
              log.mutate(planned.id);
            }}
          >
            <Check className="size-4" aria-hidden />
            Registrar
          </Button>
        ) : null}
      </div>

      <ul className="space-y-2 text-sm">
        {meals.flatMap((m) =>
          m.items.map((i) => {
            const alert = m.status === 'planned' ? alertFor(i.id) : undefined;
            const value = overrides.get(i.id) ?? i.grams;
            return (
              <li key={i.id} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{i.foodName}</span>
                  {m.status === 'logged' ? (
                    <span className="text-xs text-muted-foreground">
                      {formatNumber(i.grams)} g · registrado
                    </span>
                  ) : (
                    <GramsInput
                      label={`Gramas de ${i.foodName}`}
                      grams={value}
                      onLive={(g) => {
                        onOverride(i.id, g);
                      }}
                      onCommit={() => {
                        const g = overrides.get(i.id);
                        if (g !== undefined && g !== i.grams) {
                          update.mutate(
                            { itemId: i.id, grams: g },
                            {
                              // Falhou: volta ao valor salvo para a previsão não mentir.
                              onSettled: () => {
                                onOverride(i.id, null);
                              },
                            },
                          );
                        }
                      }}
                    />
                  )}
                </div>
                {alert ? <ItemAlert alert={alert} itemId={i.id} /> : null}
              </li>
            );
          }),
        )}
      </ul>

      {update.isError || save.isError || log.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível salvar. Tente de novo.
        </p>
      ) : null}
      {draft ? (
        <div className="space-y-2 rounded-lg border border-dashed border-border p-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{draft.food.namePt}</span>
            <Input
              aria-label={`Gramas de ${draft.food.namePt}`}
              inputMode="decimal"
              className="h-9 w-20 text-right"
              value={draft.grams}
              onChange={(e) => {
                onDraft({ ...draft, grams: e.target.value });
              }}
            />
            <span className="text-xs text-muted-foreground">g</span>
          </div>
          {draftAlert ? <ItemAlert alert={draftAlert} itemId={draftId} /> : null}
          <div className="flex gap-2">
            <Button
              disabled={save.isPending || !((parseDecimal(draft.grams) ?? 0) > 0)}
              onClick={() => {
                void save.mutateAsync(draft).then(() => {
                  onDraft(null);
                });
              }}
            >
              Planejar
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                onDraft(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            aria-label={`Adicionar em ${label}`}
            placeholder="Buscar alimento ou receita"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
            }}
          />
          {q.trim().length >= 2 ? (
            <ul
              className="divide-y divide-border rounded-lg border border-border"
              aria-label={`Resultados para ${label}`}
            >
              {(search.data?.items ?? []).map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      onDraft({ food: f, grams: '100' });
                      setQ('');
                    }}
                  >
                    <span>{f.namePt}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatNumber(f.per100.kcal ?? 0)} kcal/100 g
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </Card>
  );
}
