'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatNumber } from '@/lib/format';
import { suggestSlot } from '@atlas/core';
import type { FoodDto } from '@atlas/schemas';

import { useCreateMeal, useFoodSearch } from '../hooks/use-nutrition';
import { SLOT_LABELS } from '../labels';

import { CustomFoodForm } from './custom-food-form';

/** Busca manual com autocompletar (P6.1) e cadastro rápido. */
export function FoodSearchAdd({ date }: { date: string }) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<FoodDto | null>(null);
  const [grams, setGrams] = useState('100');
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string>();
  const search = useFoodSearch(q);
  const create = useCreateMeal();
  const slot = suggestSlot(new Date().getHours());

  const add = async () => {
    if (!picked) return;
    await create.mutateAsync({
      date,
      slot,
      items: [{ foodId: picked.id, quantity: Number(grams), unit: 'g' }],
    });
    setMessage(`${picked.namePt} registrado em ${SLOT_LABELS[slot]}.`);
    setPicked(null);
    setQ('');
  };

  return (
    <Card className="space-y-3">
      <CardTitle>Buscar alimento</CardTitle>
      <div className="space-y-1.5">
        <Label htmlFor="food-search">Nome</Label>
        <Input
          id="food-search"
          placeholder="ex.: banana, tapioca, iogurte"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPicked(null);
            setMessage(undefined);
          }}
        />
      </div>
      {q.trim().length >= 2 && !picked ? (
        <ul
          className="divide-y divide-border rounded-lg border border-border"
          aria-label="Resultados da busca"
        >
          {(search.data?.items ?? []).map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm hover:bg-muted"
                onClick={() => {
                  setPicked(f);
                }}
              >
                <span>{f.namePt}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatNumber(f.per100.kcal ?? 0)} kcal/100 g
                </span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="min-h-11 w-full px-3 text-left text-sm font-medium text-primary hover:bg-muted"
              onClick={() => {
                setCreating(true);
              }}
            >
              Não achou? Cadastrar “{q}”
            </button>
          </li>
        </ul>
      ) : null}
      {picked ? (
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="food-grams">{picked.namePt} (g)</Label>
            <Input
              id="food-grams"
              type="number"
              inputMode="decimal"
              value={grams}
              onChange={(e) => {
                setGrams(e.target.value);
              }}
            />
          </div>
          <Button
            type="button"
            onClick={() => void add()}
            disabled={create.isPending || !(Number(grams) > 0)}
          >
            Registrar
          </Button>
        </div>
      ) : null}
      {creating ? (
        <CustomFoodForm
          initialName={q}
          onCancel={() => {
            setCreating(false);
          }}
          onCreated={(food) => {
            setCreating(false);
            setPicked(food);
          }}
        />
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
    </Card>
  );
}
