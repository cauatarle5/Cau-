'use client';

import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { formatDate, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { VOLUME_LANDMARKS } from '@atlas/core';

import { useMuscleVolume } from '../hooks/use-training';
import { VOLUME_STATUS_LABELS } from '../labels';

const STATUS_COLOR: Record<string, string> = {
  below_mev: 'bg-amber-400',
  minimum: 'bg-sky-400',
  productive: 'bg-emerald-500',
  high: 'bg-orange-500',
  above_mrv: 'bg-red-500',
};

/** Séries duras por músculo na semana, com faixas MEV/produtiva/MRV (P8.2). */
export function MuscleVolumeCard() {
  const volume = useMuscleVolume();
  const data = volume.data;
  const trained = data?.items.filter((i) => i.hardSets > 0) ?? [];
  const max = VOLUME_LANDMARKS.mrv + 4;
  return (
    <Card className="space-y-3">
      <div className="space-y-1">
        <CardTitle>Volume da semana</CardTitle>
        <CardDescription>
          {data
            ? `Séries duras de ${formatDate(data.weekStart)} a ${formatDate(data.weekEnd)}. Faixa produtiva: ${String(VOLUME_LANDMARKS.productiveMin)}–${String(VOLUME_LANDMARKS.productiveMax)}.`
            : 'Séries duras por músculo nesta semana.'}
        </CardDescription>
      </div>
      {data && trained.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Registre um treino para ver o volume por músculo.
        </p>
      ) : null}
      <ul className="space-y-2" aria-label="Volume por músculo">
        {trained.map((i) => (
          <li key={i.muscle} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>{i.namePt}</span>
              <span className="tabular-nums text-muted-foreground">
                {formatNumber(i.hardSets, 1)} · {VOLUME_STATUS_LABELS[i.status]}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', STATUS_COLOR[i.status])}
                style={{ width: `${String(Math.min(100, (i.hardSets / max) * 100))}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
