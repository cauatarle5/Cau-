'use client';

import { useId, useState } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ExerciseDto } from '@atlas/schemas';

import { useExerciseSearch } from '../hooks/use-training';

/** Busca de exercícios por nome ou apelido. */
export function ExercisePicker({
  label = 'Buscar exercício',
  onPick,
}: {
  label?: string;
  onPick: (exercise: ExerciseDto) => void;
}) {
  const id = useId();
  const [q, setQ] = useState('');
  const search = useExerciseSearch(q);
  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          placeholder="ex.: supino, agachamento, remada"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
          }}
        />
      </div>
      {q.trim().length >= 2 ? (
        <ul
          className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border"
          aria-label="Exercícios encontrados"
        >
          {(search.data?.items ?? []).map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onPick(e);
                  setQ('');
                }}
              >
                <span>{e.namePt}</span>
                {e.isCustom ? <span className="text-xs text-muted-foreground">seu</span> : null}
              </button>
            </li>
          ))}
          {search.isError ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              Busca indisponível sem conexão.
            </li>
          ) : null}
          {search.data && search.data.items.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              Nenhum exercício encontrado.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
