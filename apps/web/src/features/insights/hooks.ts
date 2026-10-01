'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { InsightDto } from '@atlas/schemas';

import { insightsApi } from './api';

export const insightKeys = {
  all: ['insights'] as const,
  list: ['insights', 'list'] as const,
  context: (date: string) => ['insights', 'context', date] as const,
  summary: (from: string, to: string) => ['insights', 'summary', from, to] as const,
  compare: (key: string) => ['insights', 'compare', key] as const,
  energy: ['insights', 'energy'] as const,
};

export const useDailyContext = (date: string) =>
  useQuery({ queryKey: insightKeys.context(date), queryFn: () => insightsApi.context(date) });

export const useInsights = () =>
  useQuery({ queryKey: insightKeys.list, queryFn: () => insightsApi.list() });

export const useEnergyEstimates = () =>
  useQuery({ queryKey: insightKeys.energy, queryFn: () => insightsApi.energy() });

export const useSummary = (from: string, to: string, enabled = true) =>
  useQuery({
    queryKey: insightKeys.summary(from, to),
    queryFn: () => insightsApi.summary(from, to),
    enabled,
    placeholderData: keepPreviousData,
  });

export const useCompare = (
  a: { from: string; to: string },
  b: { from: string; to: string },
  enabled = true,
) =>
  useQuery({
    queryKey: insightKeys.compare(`${a.from}|${a.to}|${b.from}|${b.to}`),
    queryFn: () => insightsApi.compare(a, b),
    enabled,
    placeholderData: keepPreviousData,
  });

export function useSetInsightStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: InsightDto['status'] }) =>
      insightsApi.setStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: insightKeys.all }),
  });
}
