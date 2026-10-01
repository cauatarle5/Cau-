'use client';

import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { type ExerciseDto } from '@atlas/schemas';

import { useCreateProgram } from '../hooks/use-training';

import { ExercisePicker } from './exercise-picker';

interface DraftExercise {
  exercise: ExerciseDto;
  sets: string;
  repMin: string;
  repMax: string;
}
interface DraftTemplate {
  key: number;
  name: string;
  exercises: DraftExercise[];
}

let nextKey = 1;
const emptyTemplate = (name: string): DraftTemplate => ({ key: nextKey++, name, exercises: [] });

/** Programa manual: treinos (templates) com exercícios, séries e faixa de repetições. */
export function ProgramBuilder({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('Meu programa');
  const [templates, setTemplates] = useState<DraftTemplate[]>([emptyTemplate('Treino A')]);
  const [error, setError] = useState<string>();
  const create = useCreateProgram();

  const patch = (key: number, fn: (t: DraftTemplate) => DraftTemplate) => {
    setTemplates((ts) => ts.map((t) => (t.key === key ? fn(t) : t)));
  };

  const save = async () => {
    const input = {
      name,
      activate: true,
      templates: templates.map((t) => ({
        name: t.name,
        exercises: t.exercises.map((e) => ({
          exerciseId: e.exercise.id,
          sets: Number(e.sets),
          repMin: Number(e.repMin),
          repMax: Number(e.repMax),
        })),
      })),
    };
    // Validação do formulário: o schema (e o zod) só carregam ao salvar (ADR-062).
    const { programInputSchema } = await import('@atlas/schemas');
    const parsed = programInputSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os campos.');
      return;
    }
    setError(undefined);
    try {
      await create.mutateAsync(input);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar.');
    }
  };

  return (
    <Card className="space-y-4">
      <div className="space-y-1">
        <CardTitle>Novo programa</CardTitle>
        <CardDescription>
          Monte os treinos da semana. A meta de cada série é a faixa de repetições.
        </CardDescription>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="program-name">Nome do programa</Label>
        <Input
          id="program-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
      </div>

      {templates.map((t, ti) => (
        <section
          key={t.key}
          aria-label={`Treino ${String(ti + 1)}`}
          className="space-y-3 rounded-lg border border-border p-3"
        >
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor={`tpl-${String(t.key)}`}>Nome do treino {ti + 1}</Label>
              <Input
                id={`tpl-${String(t.key)}`}
                value={t.name}
                onChange={(e) => {
                  patch(t.key, (x) => ({ ...x, name: e.target.value }));
                }}
              />
            </div>
            {templates.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                aria-label={`Remover treino ${String(ti + 1)}`}
                onClick={() => {
                  setTemplates((ts) => ts.filter((x) => x.key !== t.key));
                }}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            ) : null}
          </div>

          {t.exercises.length > 0 ? (
            <ul className="space-y-2">
              {t.exercises.map((e, ei) => (
                <li
                  key={`${e.exercise.id}-${String(ei)}`}
                  className="space-y-2 rounded-md bg-muted p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{e.exercise.namePt}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Remover ${e.exercise.namePt}`}
                      onClick={() => {
                        patch(t.key, (x) => ({
                          ...x,
                          exercises: x.exercises.filter((_, i) => i !== ei),
                        }));
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ['sets', 'Séries'],
                        ['repMin', 'Reps mín.'],
                        ['repMax', 'Reps máx.'],
                      ] as const
                    ).map(([field, label]) => (
                      <label key={field} className="space-y-1 text-xs">
                        <span>{label}</span>
                        <Input
                          type="number"
                          inputMode="numeric"
                          aria-label={`${label} de ${e.exercise.namePt}`}
                          value={e[field]}
                          onChange={(ev) => {
                            patch(t.key, (x) => ({
                              ...x,
                              exercises: x.exercises.map((y, i) =>
                                i === ei ? { ...y, [field]: ev.target.value } : y,
                              ),
                            }));
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Adicione exercícios a este treino.</p>
          )}

          <ExercisePicker
            label={`Adicionar exercício ao treino ${String(ti + 1)}`}
            onPick={(exercise) => {
              patch(t.key, (x) => ({
                ...x,
                exercises: [
                  ...x.exercises,
                  {
                    exercise,
                    sets: '3',
                    repMin: exercise.mechanics === 'compound' ? '6' : '10',
                    repMax: exercise.mechanics === 'compound' ? '10' : '15',
                  },
                ],
              }));
            }}
          />
        </section>
      ))}

      {templates.length < 7 ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setTemplates((ts) => [
              ...ts,
              emptyTemplate(`Treino ${String.fromCharCode(65 + ts.length)}`),
            ]);
          }}
        >
          Adicionar treino
        </Button>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" onClick={() => void save()} disabled={create.isPending}>
          Salvar e ativar
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </Card>
  );
}
