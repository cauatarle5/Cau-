'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { coachApi } from './api';

export const coachKeys = {
  all: ['coach'] as const,
  status: ['coach', 'status'] as const,
  list: ['coach', 'list'] as const,
  conversation: (id: string) => ['coach', 'conversation', id] as const,
  weekly: ['coach', 'weekly'] as const,
};

export const useAiStatus = () => useQuery({ queryKey: coachKeys.status, queryFn: coachApi.status });
export const useConversations = () =>
  useQuery({ queryKey: coachKeys.list, queryFn: coachApi.conversations });
export const useConversation = (id: string | null) =>
  useQuery({
    queryKey: coachKeys.conversation(id ?? ''),
    queryFn: () => coachApi.conversation(id ?? ''),
    enabled: id !== null,
  });
export const useWeeklySummary = () =>
  useQuery({ queryKey: coachKeys.weekly, queryFn: coachApi.weeklySummary });

/** Aplicar/descartar mexe em refeições, treino e metas: invalida tudo. */
export function useResolveProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'reject' }) =>
      action === 'accept' ? coachApi.accept(id) : coachApi.reject(id),
    onSuccess: () => qc.invalidateQueries(),
  });
}
