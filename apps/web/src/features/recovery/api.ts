import { apiRequest } from '@/lib/api';
import type {
  activityListSchema,
  activitySchema,
  adaptedWorkoutSchema,
  checkinSchema,
  plannedWorkoutListSchema,
  plannedWorkoutSchema,
  programDraftSchema,
  recoveryLoadSchema,
  sessionSchema,
} from '@atlas/schemas';
import { type ActivityInput, type CheckinInput } from '@atlas/schemas';

export const recoveryApi = {
  checkin: (date: string) => apiRequest<typeof checkinSchema>(`/checkins/${date}`),
  putCheckin: (date: string, body: CheckinInput) =>
    apiRequest<typeof checkinSchema>(`/checkins/${date}`, { method: 'PUT', body }),
  activities: (from: string, to: string) =>
    apiRequest<typeof activityListSchema>(`/activities?from=${from}&to=${to}`),
  createActivity: (body: ActivityInput) =>
    apiRequest<typeof activitySchema>('/activities', { method: 'POST', body }),
  load: (from: string, to: string) =>
    apiRequest<typeof recoveryLoadSchema>(`/recovery/load?from=${from}&to=${to}`),
  planned: (from: string, to: string) =>
    apiRequest<typeof plannedWorkoutListSchema>(`/planned-workouts?from=${from}&to=${to}`),
  patchPlanned: (id: string, body: { date?: string; status?: 'planned' | 'skipped' }) =>
    apiRequest<typeof plannedWorkoutSchema>(`/planned-workouts/${id}`, { method: 'PATCH', body }),
  adapted: (id: string, redChoice?: 'light' | 'rest') =>
    apiRequest<typeof adaptedWorkoutSchema>(
      `/planned-workouts/${id}/adapted${redChoice ? `?redChoice=${redChoice}` : ''}`,
    ),
  startPlanned: (id: string, plannedWorkoutId: string, redChoice?: 'light' | 'rest') =>
    apiRequest<typeof sessionSchema>('/sessions', {
      method: 'POST',
      body: { id, plannedWorkoutId, ...(redChoice ? { redChoice } : {}) },
    }),
  generate: () =>
    apiRequest<typeof programDraftSchema>('/programs/generate', { method: 'POST', body: {} }),
};
