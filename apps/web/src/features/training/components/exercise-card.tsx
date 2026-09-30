'use client';

import { Check, Plus, Repeat, SkipForward, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useSyncStore } from '@/offline/queue';
import type { GhostDto, SessionExerciseDto, SetLogDto } from '@atlas/schemas';

import { activeActions, rowCount, useActiveWorkout } from '../active-store';
import { useAlternatives } from '../hooks/use-training';
import { RIR_OPTIONS, SKIP_REASONS } from '../labels';

import { Stepper } from './stepper';

const describe = (load: number | null, reps: number | null) =>
  `${load === null ? '—' : `${formatNumber(load, 2)} kg`} × ${reps === null ? '—' : String(reps)}`;

function NextSet({
  exercise,
  index,
  ghost,
  previous,
}: {
  exercise: SessionExerciseDto;
  index: number;
  ghost: GhostDto | undefined;
  previous: SetLogDto | undefined;
}) {
  const [loadKg, setLoad] = useState<number | null>(
    previous?.loadKg ?? ghost?.loadKg ?? (exercise.loadType === 'external' ? null : 0),
  );
  const [reps, setReps] = useState<number | null>(
    previous?.reps ?? ghost?.reps ?? exercise.repMin ?? null,
  );
  const [rir, setRir] = useState<number | null>(null);
  const step = exercise.defaultIncrementKg > 0 ? exercise.defaultIncrementKg : 2.5;

  return (
    <div
      className="space-y-3 rounded-lg border-2 border-primary/40 p-3"
      aria-label={`Série ${String(index + 1)}`}
    >
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Série {index + 1}</span>
        {ghost && ghost.loadKg !== null ? (
          <span className="text-muted-foreground">
            Última vez: {describe(ghost.loadKg, ghost.reps)}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Stepper
          label={exercise.loadType === 'external' ? 'Carga' : 'Carga extra'}
          unit="kg"
          value={loadKg}
          step={step}
          max={1000}
          onChange={setLoad}
        />
        <Stepper label="Repetições" value={reps} step={1} max={100} onChange={setReps} />
      </div>
      <div className="flex items-center gap-1.5" role="group" aria-label="RIR (opcional)">
        <span className="mr-1 text-xs text-muted-foreground">RIR</span>
        {RIR_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={rir === o.value}
            className={cn(
              'h-9 min-w-9 rounded-md border border-border px-2 text-sm',
              rir === o.value && 'border-primary bg-primary text-primary-foreground',
            )}
            onClick={() => {
              setRir(rir === o.value ? null : o.value);
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
      <Button
        className="w-full"
        disabled={reps === null}
        onClick={() => {
          activeActions.logSet(exercise, { setIndex: index, loadKg, reps, rir });
        }}
      >
        <Check className="size-4" aria-hidden />
        Confirmar série {index + 1}
      </Button>
    </div>
  );
}

function Substitute({ exercise, onClose }: { exercise: SessionExerciseDto; onClose: () => void }) {
  const online = useSyncStore((s) => s.online);
  const alternatives = useAlternatives(online ? exercise.exerciseId : null);
  if (!online) {
    return (
      <p className="text-sm text-muted-foreground">
        Substituir precisa de conexão para buscar alternativas.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Substituir por</p>
      <ul
        className="divide-y divide-border rounded-lg border border-border"
        aria-label="Alternativas"
      >
        {(alternatives.data?.items ?? []).map((alt) => (
          <li key={alt.id}>
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-between px-3 text-left text-sm hover:bg-muted"
              onClick={() => {
                activeActions.substitute(exercise.id, alt);
                onClose();
              }}
            >
              {alt.namePt}
              {alt.preference === 'like' ? (
                <span className="text-xs text-primary">favorito</span>
              ) : null}
            </button>
          </li>
        ))}
        {alternatives.data?.items.length === 0 ? (
          <li className="px-3 py-2 text-sm text-muted-foreground">
            Nenhuma alternativa com seus equipamentos.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

export function ExerciseCard({
  exercise,
  readOnly,
}: {
  exercise: SessionExerciseDto;
  readOnly: boolean;
}) {
  const extra = useActiveWorkout((s) => s.extraSets[exercise.id] ?? 0);
  const [panel, setPanel] = useState<'skip' | 'substitute' | null>(null);
  const rows = rowCount(exercise, extra);
  const byIndex = new Map(exercise.sets.map((s) => [s.setIndex, s]));
  const nextIndex = Array.from({ length: rows }, (_, i) => i).find((i) => !byIndex.has(i));
  const skipped = exercise.status === 'skipped';
  const last = [...exercise.sets].sort((a, b) => a.setIndex - b.setIndex).at(-1);

  const target = [
    exercise.targetSets ? `${String(exercise.targetSets)} ×` : null,
    exercise.repMin !== null && exercise.repMax !== null
      ? exercise.repMin === exercise.repMax
        ? String(exercise.repMin)
        : `${String(exercise.repMin)}–${String(exercise.repMax)}`
      : null,
    exercise.targetRir !== null ? `· RIR ${String(exercise.targetRir)}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Card className={cn('space-y-3', skipped && 'opacity-70')} aria-label={exercise.exerciseName}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{exercise.exerciseName}</h2>
          <p className="text-sm text-muted-foreground">
            {target}
            {exercise.status === 'substituted' ? ' · substituído' : ''}
            {skipped ? ` · pulado${exercise.skipReason ? ` (${exercise.skipReason})` : ''}` : ''}
          </p>
        </div>
        {!readOnly ? (
          <div className="flex gap-1">
            {skipped ? (
              <Button
                variant="outline"
                onClick={() => {
                  activeActions.unskip(exercise.id);
                }}
              >
                Retomar
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  aria-label={`Pular ${exercise.exerciseName}`}
                  onClick={() => {
                    setPanel(panel === 'skip' ? null : 'skip');
                  }}
                >
                  <SkipForward className="size-4" aria-hidden />
                </Button>
                {exercise.sets.length === 0 ? (
                  <Button
                    variant="ghost"
                    aria-label={`Substituir ${exercise.exerciseName}`}
                    onClick={() => {
                      setPanel(panel === 'substitute' ? null : 'substitute');
                    }}
                  >
                    <Repeat className="size-4" aria-hidden />
                  </Button>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>

      {panel === 'skip' ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Motivo</p>
          <div className="flex flex-wrap gap-2">
            {SKIP_REASONS.map((r) => (
              <Button
                key={r}
                variant="outline"
                onClick={() => {
                  activeActions.skip(exercise.id, r);
                  setPanel(null);
                }}
              >
                {r}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {panel === 'substitute' ? (
        <Substitute
          exercise={exercise}
          onClose={() => {
            setPanel(null);
          }}
        />
      ) : null}

      {!skipped ? (
        <ol className="space-y-2">
          {Array.from({ length: rows }, (_, i) => {
            const done = byIndex.get(i);
            const ghost = exercise.ghosts[i] ?? exercise.ghosts.at(-1);
            if (done) {
              return (
                <li
                  key={i}
                  className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm"
                  aria-label={`Série ${String(i + 1)} concluída`}
                >
                  <span className="flex items-center gap-2">
                    <Check className="size-4 text-primary" aria-hidden />
                    Série {i + 1}:{' '}
                    <strong className="tabular-nums">{describe(done.loadKg, done.reps)}</strong>
                    {done.rir !== null ? (
                      <span className="text-muted-foreground">RIR {done.rir}</span>
                    ) : null}
                  </span>
                  {!readOnly ? (
                    <button
                      type="button"
                      aria-label={`Desfazer série ${String(i + 1)}`}
                      className="flex size-9 items-center justify-center rounded-md hover:bg-card"
                      onClick={() => {
                        activeActions.deleteSet(exercise.id, done.id);
                      }}
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  ) : null}
                </li>
              );
            }
            if (!readOnly && i === nextIndex) {
              return (
                <li key={`next-${String(i)}-${String(exercise.sets.length)}`}>
                  <NextSet exercise={exercise} index={i} ghost={ghost} previous={last} />
                </li>
              );
            }
            return (
              <li key={i} className="px-3 py-1 text-sm text-muted-foreground">
                Série {i + 1}
                {ghost && ghost.loadKg !== null ? `: ${describe(ghost.loadKg, ghost.reps)}` : ''}
              </li>
            );
          })}
        </ol>
      ) : null}

      {!readOnly && !skipped ? (
        <Button
          variant="ghost"
          onClick={() => {
            activeActions.addSetRow(exercise.id);
          }}
        >
          <Plus className="size-4" aria-hidden />
          Adicionar série
        </Button>
      ) : null}
    </Card>
  );
}
