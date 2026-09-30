import { apiRequest } from '@/lib/api';
import {
  availabilityResponseSchema,
  equipmentResponseSchema,
  goalCreateResponseSchema,
  goalListSchema,
  limitationListSchema,
  limitationSchema,
  profileResponseSchema,
  sportsResponseSchema,
  type AvailabilityItem,
  type GoalInput,
  type ProfileInput,
  type SportItem,
} from '@atlas/schemas';

export const profileApi = {
  get: () => apiRequest('/profile', profileResponseSchema),
  put: (input: ProfileInput) =>
    apiRequest('/profile', profileResponseSchema, { method: 'PUT', body: input }),
  availability: () => apiRequest('/availability', availabilityResponseSchema),
  putAvailability: (items: AvailabilityItem[]) =>
    apiRequest('/availability', availabilityResponseSchema, { method: 'PUT', body: { items } }),
  equipment: () => apiRequest('/equipment', equipmentResponseSchema),
  putEquipment: (items: { equipmentCode: string; location: 'gym' | 'home' | 'other' }[]) =>
    apiRequest('/equipment', equipmentResponseSchema, { method: 'PUT', body: { items } }),
  limitations: () => apiRequest('/limitations', limitationListSchema),
  createLimitation: (input: { bodyRegion: string; severity: number; description?: string }) =>
    apiRequest('/limitations', limitationSchema, { method: 'POST', body: input }),
  deleteLimitation: (id: string) => apiRequest(`/limitations/${id}`, null, { method: 'DELETE' }),
  sports: () => apiRequest('/sports', sportsResponseSchema),
  putSports: (items: SportItem[]) =>
    apiRequest('/sports', sportsResponseSchema, { method: 'PUT', body: { items } }),
  goals: () => apiRequest('/goals', goalListSchema),
  createGoal: (input: GoalInput) =>
    apiRequest('/goals', goalCreateResponseSchema, { method: 'POST', body: input }),
};
