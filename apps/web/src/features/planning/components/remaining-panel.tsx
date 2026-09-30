'use client';

import { MacroBars } from '@/features/nutrition/components/macro-bars';
import { formatNumber } from '@/lib/format';
import type { PlanningAlert, PlanTotals } from '@atlas/core';

import { NUTRIENT_LABELS } from '../labels';

const signed = (v: number, unit: string, digits = 0) =>
  v >= 0 ? `${formatNumber(v, digits)} ${unit}` : `${formatNumber(-v, digits)} ${unit} acima`;

/** Painel fixo com o restante previsto do dia, recalculado a cada tecla (P12.5). */
export function RemainingPanel({
  targets,
  consumed,
  planned,
  remaining,
  alerts,
}: {
  targets: PlanTotals;
  consumed: PlanTotals;
  planned: PlanTotals;
  remaining: PlanTotals;
  alerts: PlanningAlert[];
}) {
  const low = alerts.filter((a): a is Extract<PlanningAlert, { kind: 'low' }> => a.kind === 'low');
  return (
    <section
      aria-label="Restante do dia"
      className="sticky bottom-16 z-10 space-y-3 rounded-xl border border-border bg-card p-4 shadow-lg lg:bottom-4"
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
      <MacroBars
        rows={[
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
        <p key={a.nutrient} className="text-xs text-muted-foreground">
          {NUTRIENT_LABELS[a.nutrient]} prevista abaixo da meta: faltam {formatNumber(a.missing, 1)}{' '}
          g.
        </p>
      ))}
    </section>
  );
}
