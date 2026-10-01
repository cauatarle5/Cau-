'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Wand2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { trainingApi } from '@/features/training/api';

import { recoveryApi } from '../api';

/** Gerador por regras (P8.7): prévia com avisos do validador e ativação. */
export function GenerateProgram({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const draft = useMutation({ mutationFn: recoveryApi.generate });
  const activate = useMutation({
    mutationFn: () => {
      const d = draft.data;
      if (!d) throw new Error('sem rascunho');
      return trainingApi.createProgram({ ...d.program, activate: true });
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['training'] }),
        qc.invalidateQueries({ queryKey: ['recovery'] }),
      ]);
      onDone();
    },
  });
  const d = draft.data;
  return (
    <Card className="space-y-3" role="region" aria-label="Gerar programa">
      <div className="space-y-1">
        <CardTitle>Gerar programa</CardTitle>
        <CardDescription>
          Monta a divisão, os exercícios e as séries a partir da sua rotina, equipamentos e
          limitações.
        </CardDescription>
      </div>
      <Button
        variant="outline"
        disabled={draft.isPending}
        onClick={() => {
          draft.mutate();
        }}
      >
        <Wand2 className="size-4" aria-hidden />
        {d ? 'Gerar de novo' : 'Gerar'}
      </Button>
      {d ? (
        <>
          <p className="text-sm">
            <strong>{d.program.name}</strong> · {d.days} dias · até {d.minutesPerSession} min
          </p>
          <ul className="space-y-2" aria-label="Treinos gerados">
            {d.program.templates.map((t) => (
              <li key={t.name} className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium">{t.name}</p>
                <p className="text-muted-foreground">
                  {t.exercises
                    .map((e) => `${d.exerciseNames[e.exerciseId] ?? ''} ${String(e.sets)}×`)
                    .join(' · ')}
                </p>
              </li>
            ))}
          </ul>
          {d.warnings.length > 0 ? (
            <ul
              className="space-y-1 text-xs text-amber-800 dark:text-amber-200"
              aria-label="Avisos do programa"
            >
              {d.warnings.map((w, i) => (
                <li key={i}>{w.message}</li>
              ))}
            </ul>
          ) : null}
          <Button
            disabled={activate.isPending}
            onClick={() => {
              activate.mutate();
            }}
          >
            Ativar programa
          </Button>
        </>
      ) : null}
    </Card>
  );
}
