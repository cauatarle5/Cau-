'use client';

import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useParseMeal } from '@/features/nutrition/hooks/use-nutrition';
import { ApiError } from '@/lib/api';
import { formatNumber, parseDecimal } from '@/lib/format';
import { recipeNutrition, type Nutrients } from '@atlas/core';
import type { FoodUnitDto } from '@atlas/schemas';

import { recipesApi } from '../api';
import { useRecipeMutation } from '../hooks';

interface Ingredient {
  foodId: string;
  foodName: string;
  quantity: number;
  unit: FoodUnitDto | null;
  grams: number;
  nutrients: Nutrients;
}

/** Criação por texto, com o mesmo parser do registro (P7.1). */
export function RecipeForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [servings, setServings] = useState('1');
  const [cooked, setCooked] = useState('');
  const [text, setText] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const parse = useParseMeal();
  const create = useRecipeMutation(recipesApi.create);

  // Porções e peso pronto inválidos bloqueiam salvar (a API exige porções ≥ 0,5).
  const servingsN = parseDecimal(servings);
  const servingsOk = servingsN !== null && servingsN >= 0.5 && servingsN <= 100;
  const cookedN = cooked.trim() ? parseDecimal(cooked) : null;
  const cookedOk = !cooked.trim() || (cookedN !== null && cookedN > 0);
  const preview =
    ingredients.length > 0 ? recipeNutrition(ingredients, servingsN ?? 1, cookedN) : null;

  const addFromText = async () => {
    const res = await parse.mutateAsync(text);
    const ok: Ingredient[] = [];
    const bad: string[] = [];
    for (const i of res.items) {
      if (i.match && i.grams !== null && i.nutrients) {
        ok.push({
          foodId: i.match.id,
          foodName: i.match.namePt,
          quantity: i.quantity,
          unit: i.unit,
          grams: i.grams,
          nutrients: i.nutrients,
        });
      } else {
        bad.push(i.raw);
      }
    }
    setIngredients((prev) => [...prev, ...ok]);
    setMissing(bad);
    setText('');
  };

  const save = async () => {
    setError(undefined);
    try {
      await create.mutateAsync({
        name,
        servings: servingsN ?? 1,
        cookedWeightG: cookedN,
        ingredients: ingredients.map((i) => ({
          foodId: i.foodId,
          quantity: i.quantity,
          unit: i.unit,
          grams: i.grams,
        })),
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar.');
    }
  };

  return (
    <Card className="space-y-4">
      <div className="space-y-1">
        <CardTitle>Nova receita</CardTitle>
        <CardDescription>
          Escreva os ingredientes como no registro: “500g frango, 10g azeite”.
        </CardDescription>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="recipe-name">Nome</Label>
        <Input
          id="recipe-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="recipe-servings">Porções</Label>
          <Input
            id="recipe-servings"
            aria-invalid={!servingsOk}
            inputMode="decimal"
            value={servings}
            onChange={(e) => {
              setServings(e.target.value);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="recipe-cooked">Peso pronto (g, opcional)</Label>
          <Input
            id="recipe-cooked"
            inputMode="decimal"
            value={cooked}
            onChange={(e) => {
              setCooked(e.target.value);
            }}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="recipe-text">Ingredientes</Label>
        <textarea
          id="recipe-text"
          className="min-h-20 w-full rounded-lg border border-border bg-card p-3 text-base"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
        <Button
          variant="outline"
          disabled={!text.trim() || parse.isPending}
          onClick={() => void addFromText()}
        >
          Adicionar ingredientes
        </Button>
      </div>
      {missing.length > 0 ? (
        <p role="alert" className="text-sm text-destructive">
          Não reconheci: {missing.join(', ')}. Ajuste o texto ou cadastre o alimento.
        </p>
      ) : null}
      {ingredients.length > 0 ? (
        <ul className="divide-y divide-border text-sm" aria-label="Ingredientes da receita">
          {ingredients.map((i, idx) => (
            <li key={`${i.foodId}-${String(idx)}`} className="flex items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1 truncate">{i.foodName}</span>
              <span className="tabular-nums text-muted-foreground">{formatNumber(i.grams)} g</span>
              <Button
                variant="ghost"
                aria-label={`Remover ${i.foodName}`}
                onClick={() => {
                  setIngredients((prev) => prev.filter((_, k) => k !== idx));
                }}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {preview ? (
        <dl className="grid grid-cols-3 gap-2 text-center text-sm" aria-label="Prévia da receita">
          <div className="rounded-lg bg-muted p-2">
            <dt className="text-xs text-muted-foreground">Total</dt>
            <dd className="font-semibold tabular-nums">
              {formatNumber(preview.total.kcal ?? 0)} kcal
            </dd>
          </div>
          <div className="rounded-lg bg-muted p-2">
            <dt className="text-xs text-muted-foreground">
              Porção ({formatNumber(preview.servingGrams)} g)
            </dt>
            <dd className="font-semibold tabular-nums">
              {formatNumber(preview.perServing.kcal ?? 0)} kcal
            </dd>
          </div>
          <div className="rounded-lg bg-muted p-2">
            <dt className="text-xs text-muted-foreground">100 g</dt>
            <dd className="font-semibold tabular-nums">
              {formatNumber(preview.per100.kcal ?? 0)} kcal
            </dd>
          </div>
        </dl>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          disabled={
            !name.trim() || ingredients.length === 0 || !servingsOk || !cookedOk || create.isPending
          }
          onClick={() => void save()}
        >
          Salvar receita
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </Card>
  );
}
