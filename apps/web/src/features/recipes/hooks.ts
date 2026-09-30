'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { recipesApi } from './api';

export const recipeKeys = { all: ['recipes'] as const };

export const useRecipes = () => useQuery({ queryKey: recipeKeys.all, queryFn: recipesApi.list });

/** Mutação que atualiza a lista de receitas, a busca de alimentos e o dia. */
export function useRecipeMutation<T>(fn: (arg: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: recipeKeys.all }),
        qc.invalidateQueries({ queryKey: ['foods'] }),
        qc.invalidateQueries({ queryKey: ['meals'] }),
        qc.invalidateQueries({ queryKey: ['nutrition'] }),
        qc.invalidateQueries({ queryKey: ['planning'] }),
      ]),
  });
}
