'use client';

import { Play } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { uuidv7 } from 'uuidv7';

import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { ActivityForm } from '@/features/recovery/components/activity-form';
import { AgendaCard } from '@/features/recovery/components/agenda-card';
import { GenerateProgram } from '@/features/recovery/components/generate-program';
import { ApiError } from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';
import { useToday } from '@/lib/use-today';

import { activeSessionId, loadSession } from '../active-store';
import { trainingApi, type SessionStartInput } from '../api';
import { useActivateProgram, usePrograms, useSessions } from '../hooks/use-training';


import { ProgramBuilder } from './program-builder';
import { SyncIndicator } from './sync-indicator';

export function TrainingHome() {
  const router = useRouter();
  const today = useToday();
  const programs = usePrograms();
  const sessions = useSessions();
  const activate = useActivateProgram();
  const [building, setBuilding] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const [resumeId, setResumeId] = useState<string | null>(null);

  useEffect(() => {
    void activeSessionId().then((id) => {
      setResumeId(id ?? null);
    });
  }, []);

  const active = programs.data?.items.find((p) => p.status === 'active');
  const others = programs.data?.items.filter((p) => p.status !== 'active') ?? [];

  const start = async (input: Omit<SessionStartInput, 'id'>) => {
    setStarting(true);
    setError(undefined);
    try {
      const session = await trainingApi.startSession({ id: uuidv7(), ...input });
      await loadSession(session.id, session);
      router.push(`/treino/sessao/${session.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 0
          ? 'Sem conexão: iniciar o treino precisa de internet. Depois disso, ele funciona offline.'
          : 'Não foi possível iniciar o treino.',
      );
      setStarting(false);
    }
  };

  return (
    <div className="space-y-4">
      <SyncIndicator />
      {resumeId ? (
        <Card className="flex items-center justify-between gap-3 border-primary">
          <div>
            <CardTitle>Treino em andamento</CardTitle>
            <CardDescription>Continue de onde parou.</CardDescription>
          </div>
          <Button asChild>
            <Link href={`/treino/sessao/${resumeId}`}>Continuar</Link>
          </Button>
        </Card>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {generating ? (
        <GenerateProgram
          onDone={() => {
            setGenerating(false);
          }}
        />
      ) : null}

      {building ? (
        <ProgramBuilder
          onDone={() => {
            setBuilding(false);
          }}
        />
      ) : active ? (
        <Card className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <CardDescription>Programa ativo</CardDescription>
              <CardTitle>{active.name}</CardTitle>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setGenerating(true);
                }}
              >
                Gerar programa
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setBuilding(true);
                }}
              >
                Novo programa
              </Button>
            </div>
          </div>
          <ul className="space-y-2">
            {active.templates.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{t.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {t.exercises.map((e) => e.exerciseName).join(' · ') || 'Sem exercícios'}
                  </p>
                </div>
                <Button
                  aria-label={`Iniciar ${t.name}`}
                  disabled={starting || t.exercises.length === 0}
                  onClick={() => void start({ workoutTemplateId: t.id })}
                >
                  <Play className="size-4" aria-hidden />
                  Iniciar
                </Button>
              </li>
            ))}
          </ul>
          <Button
            variant="ghost"
            disabled={starting}
            onClick={() => void start({ name: 'Treino livre' })}
          >
            Treino livre
          </Button>
        </Card>
      ) : programs.isSuccess ? (
        <>
          <EmptyState title="Nenhum programa ainda">
            Crie seu primeiro programa para registrar séries com um toque.
          </EmptyState>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setGenerating(true);
              }}
            >
              Gerar programa
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setBuilding(true);
              }}
            >
              Criar programa
            </Button>
            <Button
              variant="outline"
              disabled={starting}
              onClick={() => void start({ name: 'Treino livre' })}
            >
              Treino livre
            </Button>
          </div>
        </>
      ) : null}

      {others.length > 0 && !building ? (
        <Card className="space-y-2">
          <CardTitle>Outros programas</CardTitle>
          <ul className="divide-y divide-border">
            {others.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                <span className="text-sm">{p.name}</span>
                <Button
                  variant="outline"
                  disabled={activate.isPending}
                  onClick={() => {
                    activate.mutate(p.id);
                  }}
                >
                  Ativar
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <AgendaCard today={today} />
      <ActivityForm today={today} />

      <Card className="space-y-2">
        <CardTitle>Histórico</CardTitle>
        {sessions.data && sessions.data.items.length === 0 ? (
          <CardDescription>Seus treinos aparecem aqui.</CardDescription>
        ) : null}
        <ul className="divide-y divide-border" aria-label="Histórico de treinos">
          {(sessions.data?.items ?? []).map((s) => (
            <li key={s.id}>
              <Link
                href={`/treino/sessao/${s.id}`}
                className="flex items-center justify-between gap-2 py-3 hover:bg-muted"
              >
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(s.date)}
                    {s.durationMin !== null ? ` · ${String(s.durationMin)} min` : ''} · {s.setCount}{' '}
                    séries
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="tabular-nums">{formatNumber(s.tonnage)} kg</p>
                  {s.recordCount > 0 ? (
                    <p className="text-xs font-medium text-primary">
                      {s.recordCount} {s.recordCount === 1 ? 'recorde' : 'recordes'}
                    </p>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
