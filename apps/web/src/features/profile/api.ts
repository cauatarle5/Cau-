import { apiRequest } from '@/lib/api';
import type {
  availabilityResponseSchema,
  equipmentResponseSchema,
  goalCreateResponseSchema,
  goalListSchema,
  limitationListSchema,
  limitationSchema,
  profileResponseSchema,
  sportsResponseSchema,
} from '@atlas/schemas';
import {
  type AvailabilityItem,
  type GoalInput,
  type ProfileInput,
  type SportItem,
} from '@atlas/schemas';

export const profileApi = {
  get: () => apiRequest<typeof profileResponseSchema>('/profile'),
  put: (input: ProfileInput) =>
    apiRequest<typeof profileResponseSchema>('/profile', { method: 'PUT', body: input }),
  availability: () => apiRequest<typeof availabilityResponseSchema>('/availability'),
  putAvailability: (items: AvailabilityItem[]) =>
    apiRequest<typeof availabilityResponseSchema>('/availability', {
      method: 'PUT',
      body: { items },
    }),
  equipment: () => apiRequest<typeof equipmentResponseSchema>('/equipment'),
  putEquipment: (items: { equipmentCode: string; location: 'gym' | 'home' | 'other' }[]) =>
    apiRequest<typeof equipmentResponseSchema>('/equipment', { method: 'PUT', body: { items } }),
  limitations: () => apiRequest<typeof limitationListSchema>('/limitations'),
  createLimitation: (input: { bodyRegion: string; severity: number; description?: string }) =>
    apiRequest<typeof limitationSchema>('/limitations', { method: 'POST', body: input }),
  deleteLimitation: (id: string) => apiRequest<null>(`/limitations/${id}`, { method: 'DELETE' }),
  sports: () => apiRequest<typeof sportsResponseSchema>('/sports'),
  putSports: (items: SportItem[]) =>
    apiRequest<typeof sportsResponseSchema>('/sports', { method: 'PUT', body: { items } }),
  goals: () => apiRequest<typeof goalListSchema>('/goals'),
  createGoal: (input: GoalInput) =>
    apiRequest<typeof goalCreateResponseSchema>('/goals', { method: 'POST', body: input }),
};
