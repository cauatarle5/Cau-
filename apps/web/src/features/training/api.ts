import type { z } from 'zod';

import { apiRequest } from '@/lib/api';
import type {
  exerciseListSchema,
  exerciseProgressSchema,
  muscleVolumeSchema,
  programListSchema,
  programSchema,
  sessionListSchema,
  sessionSchema,
} from '@atlas/schemas';
import { type programInputSchema, type sessionStartSchema } from '@atlas/schemas';

export type ProgramInput = z.input<typeof programInputSchema>;
export type SessionStartInput = z.input<typeof sessionStartSchema>;

export const trainingApi = {
  searchExercises: (q: string) =>
    apiRequest<typeof exerciseListSchema>(`/exercises?q=${encodeURIComponent(q)}&limit=12`),
  alternatives: (id: string) =>
    apiRequest<typeof exerciseListSchema>(`/exercises/${id}/alternatives`),
  progress: (id: string) => apiRequest<typeof exerciseProgressSchema>(`/exercises/${id}/progress`),
  programs: () => apiRequest<typeof programListSchema>('/programs'),
  createProgram: (input: ProgramInput) =>
    apiRequest<typeof programSchema>('/programs', { method: 'POST', body: input }),
  activateProgram: (id: string) =>
    apiRequest<typeof programSchema>(`/programs/${id}/activate`, { method: 'POST' }),
  sessions: () => apiRequest<typeof sessionListSchema>('/sessions'),
  session: (id: string) => apiRequest<typeof sessionSchema>(`/sessions/${id}`),
  startSession: (input: SessionStartInput) =>
    apiRequest<typeof sessionSchema>('/sessions', { method: 'POST', body: input }),
  substitute: (sessionExerciseId: string, exerciseId: string) =>
    apiRequest<typeof sessionSchema>(`/session-exercises/${sessionExerciseId}`, {
      method: 'PATCH',
      body: { substituteExerciseId: exerciseId },
    }),
  muscleVolume: () => apiRequest<typeof muscleVolumeSchema>('/analytics/muscle-volume'),
};
