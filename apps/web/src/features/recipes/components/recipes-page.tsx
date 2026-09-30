'use client';

import { Copy, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { SLOT_LABELS } from '@/features/nutrition/labels';
import { formatNumber } from '@/lib/format';
import { useToday } from '@/lib/use-today';
import { suggestSlot } from '@atlas/core';
import type { RecipeDto } from '@atlas/schemas';

import { recipesApi } from '../api';
import { useRecipeMutation, useRecipes } from '../hooks';

import { RecipeForm } from './recipe-form';

function RecipeCard({ recipe }: { recipe: RecipeDto }) {
  const today = useToday();
  const [message, setMessage] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const favorite = useRecipeMutation(() =>
    recipesApi.update(recipe.id, { isFavorite: !recipe.isFavorite }),
  );
  const duplicate = useRecipeMutation(() => recipesApi.duplicate(recipe.id));
  const remove = useRecipeMutation(() => recipesApi.remove(recipe.id));
  const slot = suggestSlot(new Date().getHours());
  const log = useRecipeMutation(() => recipesApi.logPortion(today, slot, recipe.foodId ?? '', 1));
  const s = recipe.nutrition.perServing;
  return (
    <Card className="space-y-2" role="region" aria-label={recipe.name}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">{recipe.name}</CardTitle>
          <CardDescription>
            {formatNumber(recipe.servings, 1)} {recipe.servings === 1 ? 'porção' : 'porções'} de{' '}
            {formatNumber(recipe.nutrition.servingGrams)} g ·{' '}
            {formatNumber(recipe.nutrition.per100.kcal ?? 0)} kcal/100 g
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          aria-label={
            recipe.isFavorite ? `Desfavoritar ${recipe.name}` : `Favoritar ${recipe.name}`
          }
          aria-pressed={recipe.isFavorite}
          onClick={() => {
            favorite.mutate(undefined);
          }}
        >
          <Star
            className={recipe.isFavorite ? 'size-4 fill-current text-amber-500' : 'size-4'}
            aria-hidden
          />
        </Button>
      </div>
      <p className="text-sm tabular-nums" data-testid="recipe-serving">
        Porção: {formatNumber(s.kcal ?? 0)} kcal · P {formatNumber(s.proteinG ?? 0, 1)} g · C{' '}
        {formatNumber(s.carbsG ?? 0, 1)} g · G {formatNumber(s.fatG ?? 0, 1)} g
      </p>
      <p className="text-xs text-muted-foreground">
        {recipe.ingredients.map((i) => `${i.foodName} (${formatNumber(i.grams)} g)`).join(' · ')}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={!recipe.foodId || log.isPending}
          onClick={() => {
            log.mutate(undefined, {
              onSuccess: () => {
                setMessage(`1 porção registrada em ${SLOT_LABELS[slot]}.`);
              },
            });
          }}
        >
          Registrar 1 porção
        </Button>
        <Button
          variant="ghost"
          aria-label={`Duplicar ${recipe.name}`}
          onClick={() => {
            duplicate.mutate(undefined);
          }}
        >
          <Copy className="size-4" aria-hidden />
        </Button>
        {confirming ? (
          <Button
            variant="outline"
            className="text-destructive"
            onClick={() => {
              remove.mutate(undefined);
            }}
          >
            Confirmar exclusão
          </Button>
        ) : (
          <Button
            variant="ghost"
            aria-label={`Excluir ${recipe.name}`}
            onClick={() => {
              setConfirming(true);
            }}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        )}
      </div>
      {message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
    </Card>
  );
}

export function RecipesPage() {
  const recipes = useRecipes();
  const [creating, setCreating] = useState(false);
  const items = recipes.data?.items ?? [];
  return (
    <div className="space-y-4">
      {creating ? (
        <RecipeForm
          onDone={() => {
            setCreating(false);
          }}
        />
      ) : (
        <Button
          onClick={() => {
            setCreating(true);
          }}
        >
          Nova receita
        </Button>
      )}
      {recipes.isSuccess && items.length === 0 && !creating ? (
        <EmptyState title="Nenhuma receita ainda">
          Cadastre uma receita para registrar por porção ou por gramas, como qualquer alimento.
        </EmptyState>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {items.map((r) => (
          <RecipeCard key={r.id} recipe={r} />
        ))}
      </div>
    </div>
  );
}
