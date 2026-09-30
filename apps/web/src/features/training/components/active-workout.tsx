'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { formatDate, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useSyncStore } from '@/offline/queue';
import { isHardSet, tonnage, type SetLike } from '@atlas/core';
import type { SessionDto } from '@atlas/schemas';

import { activeActions, loadSession, useActiveWorkout } from '../active-store';
import { trainingApi } from '../api';
import { trainingKeys } from '../hooks/use-training';
import { RECORD_LABELS } from '../labels';

import { ExerciseCard } from './exercise-card';
import { ExercisePicker } from './exercise-picker';
import { RestTimer } from './rest-timer';
import { SyncIndicator } from './sync-indicator';

function localStats(session: SessionDto) {
  const sets: SetLike[] = session.exercises.flatMap((e) => e.sets);
  return { tonnage: tonnage(sets), hardSets: sets.filter(isHardSet).length, count: sets.length };
}

function FinishPanel() {
  const [rpe, setRpe] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button
        className="w-full"
        onClick={() => {
          setOpen(true);
        }}
      >
        Finalizar treino
      </Button>
    );
  }
  return (
    <Card className="space-y-3">
      <CardTitle>Como foi o treino?</CardTitle>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Esforço da sessão (RPE 1–10)</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="RPE da sessão">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={rpe === v}
              className={cn(
                'size-10 rounded-md border border-border text-sm',
                rpe === v && 'border-primary bg-primary text-primary-foreground',
              )}
              onClick={() => {
                setRpe(v);
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="session-notes">Notas (opcional)</Label>
        <textarea
          id="session-notes"
          className="min-h-20 w-full rounded-lg border border-border bg-card p-3 text-base"
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
        />
      </div>
      <Button
        className="w-full"
        onClick={() => {
          activeActions.finish({ sessionRpe: rpe, notes: notes.trim() || null });
        }}
      >
        Salvar treino
      </Button>
    </Card>
  );
}

function Summary({ session }: { session: SessionDto }) {
  const router = useRouter();
  const qc = useQueryClient();
  const pending = useSyncStore((s) => s.pending);
  const synced = pending === 0;
  const server = useQuery({
    queryKey: ['training', 'session', session.id, 'summary'],
    queryFn: () => trainingApi.session(session.id),
    enabled: synced,
  });
  useEffect(() => {
    if (synced) void qc.invalidateQueries({ queryKey: trainingKeys.all });
  }, [synced, qc]);
  const local = localStats(session);
  const data = server.data;
  const tonnageKg = data?.tonnage ?? local.tonnage;
  const hardSets = data?.hardSets ?? local.hardSets;

  return (
    <Card className="space-y-3" aria-label="Resumo do treino">
      <div className="space-y-1">
        <CardTitle>Treino concluído</CardTitle>
        <CardDescription>
          {formatDate(session.date)}
          {data?.durationMin != null ? ` · ${String(data.durationMin)} min` : ''}
          {data?.sessionRpe != null ? ` · RPE ${String(data.sessionRpe)}` : ''}
        </CardDescription>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-muted p-2">
          <dt className="text-xs text-muted-foreground">Séries</dt>
          <dd className="text-lg font-semibold tabular-nums">{local.count}</dd>
        </div>
        <div className="rounded-lg bg-muted p-2">
          <dt className="text-xs text-muted-foreground">Séries duras</dt>
          <dd className="text-lg font-semibold tabular-nums">{formatNumber(hardSets)}</dd>
        </div>
        <div className="rounded-lg bg-muted p-2">
          <dt className="text-xs text-muted-foreground">Tonelagem</dt>
          <dd className="text-lg font-semibold tabular-nums" data-testid="summary-tonnage">
            {formatNumber(tonnageKg)} kg
          </dd>
        </div>
      </dl>
      {!synced ? (
        <p className="text-sm text-muted-foreground">
          Salvo no aparelho. Recordes aparecem quando sincronizar.
        </p>
      ) : data ? (
        data.records.length > 0 ? (
          <ul className="space-y-1" aria-label="Recordes">
            {data.records.map((r, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <Trophy className="size-4 text-primary" aria-hidden />
                {r.exerciseName}: {RECORD_LABELS[r.type] ?? r.type} ({formatNumber(r.value, 1)})
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Sem recordes desta vez.</p>
        )
      ) : null}
      <Button
        className="w-full"
        disabled={!synced}
        onClick={() => {
          void activeActions.close().then(() => {
            router.push('/treino');
          });
        }}
      >
        Concluir
      </Button>
    </Card>
  );
}

export function ActiveWorkout({ id }: { id: string }) {
  const { session, finished, loading, error, records } = useActiveWorkout();
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    void loadSession(id);
  }, [id]);

  if (loading || (!session && !error))
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (error || !session || session.id !== id) {
    return <p className="text-sm text-destructive">{error ?? 'Treino não encontrado.'}</p>;
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{session.name}</h1>
        <SyncIndicator />
      </div>

      {records.length > 0 && !finished ? (
        <ul className="space-y-1" aria-label="Recordes do treino">
          {records.map((r) => (
            <li
              key={r.setId}
              className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm"
            >
              <Trophy className="size-4 text-primary" aria-hidden />
              Recorde em {r.exerciseName}: {r.types.map((t) => RECORD_LABELS[t] ?? t).join(', ')}
            </li>
          ))}
        </ul>
      ) : null}

      {finished ? <Summary session={session} /> : null}

      {session.exercises.map((e) => (
        <ExerciseCard key={e.id} exercise={e} readOnly={finished} />
      ))}

      {!finished ? (
        <>
          {adding ? (
            <Card>
              <ExercisePicker
                label="Adicionar exercício"
                onPick={(exercise) => {
                  activeActions.addExercise(exercise);
                  setAdding(false);
                }}
              />
            </Card>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setAdding(true);
              }}
            >
              Adicionar exercício
            </Button>
          )}
          <FinishPanel />
          <RestTimer />
        </>
      ) : null}
    </div>
  );
}
