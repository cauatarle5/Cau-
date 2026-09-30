import { apiRequest } from '@/lib/api';
import {
  bodyMeasurementCreateResponseSchema,
  bodyMeasurementListSchema,
  bodyMeasurementSchema,
  bodyTrendResponseSchema,
  type BodyMeasurementInput,
} from '@atlas/schemas';

export const bodyApi = {
  list: (limit = 20) => apiRequest(`/body-measurements?limit=${limit}`, bodyMeasurementListSchema),
  create: (input: BodyMeasurementInput) =>
    apiRequest('/body-measurements', bodyMeasurementCreateResponseSchema, {
      method: 'POST',
      body: input,
    }),
  patch: (id: string, input: Partial<BodyMeasurementInput>) =>
    apiRequest(`/body-measurements/${id}`, bodyMeasurementSchema, { method: 'PATCH', body: input }),
  remove: (id: string) => apiRequest(`/body-measurements/${id}`, null, { method: 'DELETE' }),
  trend: (from: string, to: string) =>
    apiRequest(`/body/trend?from=${from}&to=${to}`, bodyTrendResponseSchema),
};
