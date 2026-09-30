'use client';

import { useState, type SyntheticEvent } from 'react';

import { Button } from '@/components/ui/button';
import { FormField } from '@/features/auth/components/form-field';
import { ApiError } from '@/lib/api';
import type { FoodDto } from '@atlas/schemas';

import { useCreateFood } from '../hooks/use-nutrition';

const FIELDS = [
  ['referenceAmount', 'Porção (g)'],
  ['kcal', 'Calorias (kcal)'],
  ['proteinG', 'Proteína (g)'],
  ['carbsG', 'Carboidrato (g)'],
  ['fatG', 'Gordura (g)'],
  ['fiberG', 'Fibra (g, opcional)'],
] as const;

type FieldKey = (typeof FIELDS)[number][0];

/** Cadastro rápido (P6.3): valores da porção do rótulo; a API converte para 100 g. */
export function CustomFoodForm({
  initialName = '',
  onCreated,
  onCancel,
}: {
  initialName?: string;
  onCreated: (food: FoodDto) => void;
  onCancel?: () => void;
}) {
  const create = useCreateFood();
  const [name, setName] = useState(initialName);
  const [values, setValues] = useState<Record<FieldKey, string>>({
    referenceAmount: '100',
    kcal: '',
    proteinG: '',
    carbsG: '',
    fatG: '',
    fiberG: '',
  });
  const [error, setError] = useState<string>();

  const num = (v: string) => Number(v.replace(',', '.'));

  const onSubmit = async (e: SyntheticEvent) => {
    e.preventDefault();
    setError(undefined);
    try {
      const food = await create.mutateAsync({
        namePt: name,
        referenceAmount: num(values.referenceAmount),
        kcal: num(values.kcal),
        proteinG: num(values.proteinG),
        carbsG: num(values.carbsG),
        fatG: num(values.fatG),
        fiberG: values.fiberG ? num(values.fiberG) : null,
      });
      onCreated(food);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.problem.errors?.[0]?.message ?? err.problem.detail ?? err.problem.title)
          : 'Não foi possível salvar.',
      );
    }
  };

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="space-y-3 rounded-lg border border-border bg-card p-3"
      aria-label="Cadastrar alimento"
      noValidate
    >
      <p className="text-sm font-medium">Cadastrar alimento (valores do rótulo)</p>
      <FormField
        id="custom-food-name"
        label="Nome"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map(([key, label]) => (
          <FormField
            key={key}
            id={`custom-food-${key}`}
            label={label}
            type="number"
            inputMode="decimal"
            value={values[key]}
            onChange={(e) => {
              setValues((v) => ({ ...v, [key]: e.target.value }));
            }}
          />
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" className="flex-1" disabled={create.isPending}>
          {create.isPending ? 'Salvando…' : 'Salvar alimento'}
        </Button>
      </div>
    </form>
  );
}
