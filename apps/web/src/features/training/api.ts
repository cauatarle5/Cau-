import type { z } from 'zod';

import { apiRequest } from '@/lib/api';
import {
  exerciseListSchema,
  exerciseProgressSchema,
  muscleVolumeSchema,
  programListSchema,
  programSchema,
  sessionListSchema,
  sessionSchema,
  type programInputSchema,
  type sessionStartSchema,
} from '@atlas/schemas';

export type ProgramInput = z.input<typeof programInputSchema>;
export type SessionStartInput = z.input<typeof sessionStartSchema>;

export const trainingApi = {
  searchExercises: (q: string) =>
    apiRequest(`/exercises?q=${encodeURIComponent(q)}&limit=12`, exerciseListSchema),
  alternatives: (id: string) => apiRequest(`/exercises/${id}/alternatives`, exerciseListSchema),
  progress: (id: string) => apiRequest(`/exercises/${id}/progress`, exerciseProgressSchema),
  programs: () => apiRequest('/programs', programListSchema),
  createProgram: (input: ProgramInput) =>
    apiRequest('/programs', programSchema, { method: 'POST', body: input }),
  activateProgram: (id: string) =>
    apiRequest(`/programs/${id}/activate`, programSchema, { method: 'POST' }),
  sessions: () => apiRequest('/sessions', sessionListSchema),
  session: (id: string) => apiRequest(`/sessions/${id}`, sessionSchema),
  startSession: (input: SessionStartInput) =>
    apiRequest('/sessions', sessionSchema, { method: 'POST', body: input }),
  substitute: (sessionExerciseId: string, exerciseId: string) =>
    apiRequest(`/session-exercises/${sessionExerciseId}`, sessionSchema, {
      method: 'PATCH',
      body: { substituteExerciseId: exerciseId },
    }),
  muscleVolume: () => apiRequest('/analytics/muscle-volume', muscleVolumeSchema),
};
