'use client';

import { Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { uuidv7 } from 'uuidv7';

import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { loadSession } from '@/features/training/active-store';
import { formatDate, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { addDays } from '@atlas/core';

import { recoveryApi } from '../api';
import { useAdapted, usePlanned } from '../hooks';
import { BAND_CLASSES, BAND_LABELS } from '../labels';

/** Treino do dia já adaptado (P12.2/P8.6): ajustes com motivo e "Começar". */
export function TodayWorkoutCard({ today }: { today: string }) {
  const router = useRouter();
  const planned = usePlanned(today, addDays(today, 7));
  const items = planned.data?.items ?? [];
  const todays = items.find(
    (p) => p.date === today && (p.status === 'planned' || p.status === 'moved'),
  );
  const next = items.find((p) => p.date > today && p.status !== 'skipped');
  const [choice, setChoice] = useState<'light' | 'rest' | undefined>();
  const adapted = useAdapted(todays?.id ?? null, choice);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const done = items.find((p) => p.date === today && p.sessionId);

  if (planned.isPending)
    return <div className="h-32 animate-pulse rounded-xl bg-muted" aria-busy="true" />;

  if (!todays) {
    return (
      <Card className="space-y-1" role="region" aria-label="Treino do dia">
        <CardTitle>Treino do dia</CardTitle>
        <CardDescription>
          {done
            ? 'Treino de hoje já iniciado.'
            : next
              ? `Descanso hoje. Próximo: ${next.templateName} em ${formatDate(next.date).slice(0, 5)}.`
              : 'Nenhum treino agendado. Gere ou ative um programa em Treino.'}
        </CardDescription>
      </Card>
    );
  }

  const a = adapted.data;
  const start = async () => {
    setStarting(true);
    setError(undefined);
    try {
      const session = await recoveryApi.startPlanned(uuidv7(), todays.id, choice);
      await loadSession(session.id, session);
      router.push(`/treino/sessao/${session.id}`);
    } catch {
      setError('Não foi possível iniciar. Verifique a conexão.');
      setStarting(false);
    }
  };

  return (
    <Card className="space-y-3" role="region" aria-label="Treino do dia">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <CardDescription>
            Treino do dia{todays.deload ? ' · semana de deload' : ''}
          </CardDescription>
          <CardTitle>{todays.templateName}</CardTitle>
          {a ? (
            <CardDescription>Cerca de {formatNumber(a.estimatedMinutes)} min</CardDescription>
          ) : null}
        </div>
        {a ? (
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium',
              BAND_CLASSES[a.readiness.band],
            )}
          >
            {BAND_LABELS[a.readiness.band]}
          </span>
        ) : null}
      </div>

      {a && a.explanation.length > 0 ? (
        <ul className="space-y-1 rounded-lg bg-muted p-3 text-sm" aria-label="Ajustes de hoje">
          {a.explanation.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      {a?.readiness.band === 'red' ? (
        <div className="flex gap-2" role="group" aria-label="Como treinar hoje">
          <Button
            variant={choice !== 'rest' ? 'default' : 'outline'}
            aria-pressed={choice !== 'rest'}
            onClick={() => {
              setChoice('light');
            }}
          >
            Sessão leve
          </Button>
          <Button
            variant={choice === 'rest' ? 'default' : 'outline'}
            aria-pressed={choice === 'rest'}
            onClick={() => {
              setChoice('rest');
            }}
          >
            Descanso
          </Button>
        </div>
      ) : null}

      {a && a.mode !== 'rest' ? (
        <ul className="divide-y divide-border text-sm" aria-label="Exercícios de hoje">
          {a.exercises.map((e) => (
            <li
              key={e.exerciseId}
              className={cn(
                'flex justify-between gap-2 py-1.5',
                e.removed && 'text-muted-foreground line-through',
              )}
            >
              <span>
                {e.name}
                {e.substitute ? (
                  <span className="ml-1 text-xs text-amber-700">substituir</span>
                ) : null}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {e.removed
                  ? 'fora hoje'
                  : `${String(e.sets)} × ${String(e.repMin)}–${String(e.repMax)}`}
                {!e.removed && e.sets !== e.originalSets ? ` (era ${String(e.originalSets)})` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {a?.mode === 'rest' ? (
        <CardDescription>Aproveite para caminhar ou fazer mobilidade leve.</CardDescription>
      ) : (
        <Button className="w-full" disabled={!a || starting} onClick={() => void start()}>
          <Play className="size-4" aria-hidden />
          Começar
        </Button>
      )}
    </Card>
  );
}
