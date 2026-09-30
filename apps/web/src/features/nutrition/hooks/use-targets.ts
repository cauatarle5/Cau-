'use client';

import { useQuery } from '@tanstack/react-query';

import { nutritionApi } from '../api';

export const nutritionKeys = {
  all: ['nutrition'] as const,
  targets: (from: string, to: string) => ['nutrition', 'targets', from, to] as const,
};

export const useTargets = (date: string) =>
  useQuery({
    queryKey: nutritionKeys.targets(date, date),
    queryFn: () => nutritionApi.targets(date, date),
  });
