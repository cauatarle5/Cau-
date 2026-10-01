import { apiRequest } from '@/lib/api';
import type {
  bodyMeasurementCreateResponseSchema,
  bodyMeasurementListSchema,
  bodyMeasurementSchema,
  bodyTrendResponseSchema,
} from '@atlas/schemas';
import { type BodyMeasurementInput } from '@atlas/schemas';

export const bodyApi = {
  list: (limit = 20) =>
    apiRequest<typeof bodyMeasurementListSchema>(`/body-measurements?limit=${limit}`),
  create: (input: BodyMeasurementInput) =>
    apiRequest<typeof bodyMeasurementCreateResponseSchema>('/body-measurements', {
      method: 'POST',
      body: input,
    }),
  patch: (id: string, input: Partial<BodyMeasurementInput>) =>
    apiRequest<typeof bodyMeasurementSchema>(`/body-measurements/${id}`, {
      method: 'PATCH',
      body: input,
    }),
  remove: (id: string) => apiRequest<null>(`/body-measurements/${id}`, { method: 'DELETE' }),
  trend: (from: string, to: string) =>
    apiRequest<typeof bodyTrendResponseSchema>(`/body/trend?from=${from}&to=${to}`),
};
