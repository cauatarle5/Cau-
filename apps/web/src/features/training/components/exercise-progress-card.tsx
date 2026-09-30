'use client';

import { useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { formatDate, formatNumber } from '@/lib/format';
import type { ExerciseDto } from '@atlas/schemas';

import { useExerciseProgress } from '../hooks/use-training';
import { RECORD_LABELS } from '../labels';

import { ExercisePicker } from './exercise-picker';

/** Progresso por exercício: e1RM por sessão e recordes (P8.1). */
export function ExerciseProgressCard() {
  const [exercise, setExercise] = useState<ExerciseDto | null>(null);
  const progress = useExerciseProgress(exercise?.id ?? null);
  const points = (progress.data?.points ?? []).filter((p) => p.bestE1rm !== null);
  const rows = points.map((p) => ({ date: formatDate(p.date).slice(0, 5), e1rm: p.bestE1rm }));
  const best = progress.data?.records.find((r) => r.type === 'e1rm');

  return (
    <Card className="space-y-3">
      <div className="space-y-1">
        <CardTitle>Progresso por exercício</CardTitle>
        <CardDescription>
          {exercise ? exercise.namePt : 'Escolha um exercício para ver o e1RM por sessão.'}
        </CardDescription>
      </div>
      <ExercisePicker label="Exercício" onPick={setExercise} />
      {exercise && progress.data ? (
        points.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem séries registradas neste exercício.</p>
        ) : (
          <>
            <div className="h-48" role="img" aria-label={`Gráfico de e1RM de ${exercise.namePt}`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ left: -16, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={['auto', 'auto']} />
                  <Tooltip formatter={(v) => [`${formatNumber(Number(v), 1)} kg`, 'e1RM']} />
                  <Line
                    type="monotone"
                    dataKey="e1rm"
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-1 text-sm" aria-label="Sessões do exercício">
              {[...points].reverse().map((p) => (
                <li key={p.sessionId} className="flex justify-between gap-2">
                  <span>{formatDate(p.date)}</span>
                  <span className="tabular-nums text-muted-foreground">
                    e1RM {formatNumber(p.bestE1rm ?? 0, 1)} kg · máx.{' '}
                    {formatNumber(p.topLoadKg ?? 0, 1)} kg · {formatNumber(p.tonnage)} kg
                  </span>
                </li>
              ))}
            </ul>
            {best ? (
              <p className="text-sm">
                Recorde de {RECORD_LABELS.e1rm}:{' '}
                <strong className="tabular-nums">{formatNumber(best.value, 1)} kg</strong>
              </p>
            ) : null}
          </>
        )
      ) : null}
    </Card>
  );
}
