'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { trainingApi, type ProgramInput } from '../api';

export const trainingKeys = {
  all: ['training'] as const,
  programs: ['training', 'programs'] as const,
  sessions: ['training', 'sessions'] as const,
  volume: ['training', 'volume'] as const,
  progress: (id: string) => ['training', 'progress', id] as const,
};

export const useExerciseSearch = (q: string) =>
  useQuery({
    queryKey: ['exercises', 'search', q],
    queryFn: () => trainingApi.searchExercises(q),
    enabled: q.trim().length >= 2,
    placeholderData: keepPreviousData,
  });

export const usePrograms = () =>
  useQuery({ queryKey: trainingKeys.programs, queryFn: trainingApi.programs });

export const useSessions = () =>
  useQuery({ queryKey: trainingKeys.sessions, queryFn: trainingApi.sessions });

export const useMuscleVolume = () =>
  useQuery({ queryKey: trainingKeys.volume, queryFn: trainingApi.muscleVolume });

export const useExerciseProgress = (id: string | null) =>
  useQuery({
    queryKey: trainingKeys.progress(id ?? ''),
    queryFn: () => trainingApi.progress(id ?? ''),
    enabled: id !== null,
  });

export const useAlternatives = (id: string | null) =>
  useQuery({
    queryKey: ['exercises', 'alternatives', id],
    queryFn: () => trainingApi.alternatives(id ?? ''),
    enabled: id !== null,
  });

export function useCreateProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProgramInput) => trainingApi.createProgram(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: trainingKeys.programs }),
  });
}

export function useActivateProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => trainingApi.activateProgram(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: trainingKeys.programs }),
  });
}
