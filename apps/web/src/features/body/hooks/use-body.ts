'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { nutritionKeys } from '@/features/nutrition/hooks/use-targets';
import { profileKeys } from '@/features/profile/hooks/use-profile';
import type { BodyMeasurementInput } from '@atlas/schemas';

import { bodyApi } from '../api';

export const bodyKeys = {
  all: ['body'] as const,
  list: ['body', 'list'] as const,
  trend: (from: string, to: string) => ['body', 'trend', from, to] as const,
};

export const useMeasurements = () =>
  useQuery({ queryKey: bodyKeys.list, queryFn: () => bodyApi.list() });

export const useTrend = (from: string, to: string) =>
  useQuery({ queryKey: bodyKeys.trend(from, to), queryFn: () => bodyApi.trend(from, to) });

/** Após registrar ou remover, peso e metas mudam: invalida tudo que depende deles. */
function useInvalidateBody() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: bodyKeys.all }),
      qc.invalidateQueries({ queryKey: nutritionKeys.all }),
      qc.invalidateQueries({ queryKey: profileKeys.profile }),
    ]);
}

export function useCreateMeasurement() {
  const invalidate = useInvalidateBody();
  return useMutation({
    mutationFn: (input: BodyMeasurementInput) => bodyApi.create(input),
    onSuccess: invalidate,
  });
}

export function useDeleteMeasurement() {
  const invalidate = useInvalidateBody();
  return useMutation({ mutationFn: (id: string) => bodyApi.remove(id), onSuccess: invalidate });
}
