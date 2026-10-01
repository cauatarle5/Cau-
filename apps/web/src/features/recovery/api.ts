import { apiRequest } from '@/lib/api';
import {
  activityListSchema,
  activitySchema,
  adaptedWorkoutSchema,
  checkinSchema,
  plannedWorkoutListSchema,
  plannedWorkoutSchema,
  programDraftSchema,
  recoveryLoadSchema,
  sessionSchema,
  type ActivityInput,
  type CheckinInput,
} from '@atlas/schemas';

export const recoveryApi = {
  checkin: (date: string) => apiRequest(`/checkins/${date}`, checkinSchema),
  putCheckin: (date: string, body: CheckinInput) =>
    apiRequest(`/checkins/${date}`, checkinSchema, { method: 'PUT', body }),
  activities: (from: string, to: string) =>
    apiRequest(`/activities?from=${from}&to=${to}`, activityListSchema),
  createActivity: (body: ActivityInput) =>
    apiRequest('/activities', activitySchema, { method: 'POST', body }),
  load: (from: string, to: string) =>
    apiRequest(`/recovery/load?from=${from}&to=${to}`, recoveryLoadSchema),
  planned: (from: string, to: string) =>
    apiRequest(`/planned-workouts?from=${from}&to=${to}`, plannedWorkoutListSchema),
  patchPlanned: (id: string, body: { date?: string; status?: 'planned' | 'skipped' }) =>
    apiRequest(`/planned-workouts/${id}`, plannedWorkoutSchema, { method: 'PATCH', body }),
  adapted: (id: string, redChoice?: 'light' | 'rest') =>
    apiRequest(
      `/planned-workouts/${id}/adapted${redChoice ? `?redChoice=${redChoice}` : ''}`,
      adaptedWorkoutSchema,
    ),
  startPlanned: (id: string, plannedWorkoutId: string, redChoice?: 'light' | 'rest') =>
    apiRequest('/sessions', sessionSchema, {
      method: 'POST',
      body: { id, plannedWorkoutId, ...(redChoice ? { redChoice } : {}) },
    }),
  generate: () =>
    apiRequest('/programs/generate', programDraftSchema, { method: 'POST', body: {} }),
};
