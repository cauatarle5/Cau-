'use client';

import { MacroBars } from '@/features/nutrition/components/macro-bars';
import { formatNumber } from '@/lib/format';
import type { PlanningAlert, PlanTotals } from '@atlas/core';
import type { MealDto, MealSlot } from '@atlas/schemas';

import { NUTRIENT_LABELS } from '../labels';

import { ComplementList } from './complement-list';

const signed = (v: number, unit: string, digits = 0) =>
  v >= 0 ? `${formatNumber(v, digits)} ${unit}` : `${formatNumber(-v, digits)} ${unit} acima`;

/** Painel fixo com o restante previsto do dia, recalculado a cada tecla (P12.5). */
export function RemainingPanel({
  targets,
  consumed,
  planned,
  remaining,
  alerts,
  date,
  meals,
  slot,
}: {
  targets: PlanTotals;
  consumed: PlanTotals;
  planned: PlanTotals;
  remaining: PlanTotals;
  alerts: PlanningAlert[];
  date: string;
  meals: readonly MealDto[];
  slot: MealSlot;
}) {
  const low = alerts.filter((a): a is Extract<PlanningAlert, { kind: 'low' }> => a.kind === 'low');
  return (
    <section
      aria-label="Restante do dia"
      className="sticky bottom-16 z-10 space-y-2 rounded-xl border border-border bg-card p-3 shadow-lg lg:bottom-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">Restante previsto</span>
        <span className="text-xl font-semibold tabular-nums" data-testid="remaining-kcal">
          {signed(remaining.kcal, 'kcal')}
        </span>
      </div>
      <p className="text-xs text-muted-foreground tabular-nums" data-testid="remaining-macros">
        P {signed(remaining.proteinG, 'g', 1)} · C {signed(remaining.carbsG, 'g', 1)} · G{' '}
        {signed(remaining.fatG, 'g', 1)}
      </p>
      <details className="group">
        <summary className="cursor-pointer text-xs font-medium text-primary">
          Detalhes
          {low.length > 0
            ? ` · ${String(low.length)} ${low.length === 1 ? 'sugestão' : 'sugestões'}`
            : ''}
        </summary>
        <div className="mt-3 max-h-[45dvh] space-y-3 overflow-y-auto">
          <MacroBars
            rows={[
              {
                label: 'Calorias',
                consumed: consumed.kcal,
                planned: planned.kcal,
                target: targets.kcal,
                unit: 'kcal',
              },
              {
                label: 'Proteína',
                consumed: consumed.proteinG,
                planned: planned.proteinG,
                target: targets.proteinG,
                unit: 'g',
              },
              {
                label: 'Carboidrato',
                consumed: consumed.carbsG,
                planned: planned.carbsG,
                target: targets.carbsG,
                unit: 'g',
              },
              {
                label: 'Gordura',
                consumed: consumed.fatG,
                planned: planned.fatG,
                target: targets.fatG,
                unit: 'g',
              },
            ]}
          />
          {low.map((a) => (
            <div key={a.nutrient} className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {NUTRIENT_LABELS[a.nutrient]} prevista abaixo da meta: faltam{' '}
                {formatNumber(a.missing, 1)} g.
              </p>
              <ComplementList date={date} nutrient={a.nutrient} meals={meals} slot={slot} />
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
