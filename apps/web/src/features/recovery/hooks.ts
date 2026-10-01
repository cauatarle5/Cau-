'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ActivityInput, CheckinInput } from '@atlas/schemas';

import { recoveryApi } from './api';

export const recoveryKeys = {
  all: ['recovery'] as const,
  checkin: (date: string) => ['recovery', 'checkin', date] as const,
  planned: (from: string, to: string) => ['recovery', 'planned', from, to] as const,
  adapted: (id: string, choice?: string) => ['recovery', 'adapted', id, choice ?? ''] as const,
  load: (from: string, to: string) => ['recovery', 'load', from, to] as const,
};

export const useCheckin = (date: string) =>
  useQuery({ queryKey: recoveryKeys.checkin(date), queryFn: () => recoveryApi.checkin(date) });

export const usePlanned = (from: string, to: string) =>
  useQuery({
    queryKey: recoveryKeys.planned(from, to),
    queryFn: () => recoveryApi.planned(from, to),
  });

export const useAdapted = (id: string | null, redChoice?: 'light' | 'rest') =>
  useQuery({
    queryKey: recoveryKeys.adapted(id ?? '', redChoice),
    queryFn: () => recoveryApi.adapted(id ?? '', redChoice),
    enabled: id !== null,
  });

export const useLoad = (from: string, to: string) =>
  useQuery({ queryKey: recoveryKeys.load(from, to), queryFn: () => recoveryApi.load(from, to) });

/** Check-in, atividades e agenda mudam a prontidão e a adaptação: invalida tudo de recuperação. */
function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: recoveryKeys.all }),
      qc.invalidateQueries({ queryKey: ['training'] }),
    ]);
}

export function usePutCheckin(date: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: CheckinInput) => recoveryApi.putCheckin(date, body),
    onSuccess: invalidate,
  });
}

export function useCreateActivity() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ActivityInput) => recoveryApi.createActivity(body),
    onSuccess: invalidate,
  });
}

export function usePatchPlanned() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; date?: string; status?: 'planned' | 'skipped' }) =>
      recoveryApi.patchPlanned(id, body),
    onSuccess: invalidate,
  });
}
