import { apiRequest } from '@/lib/api';
import { targetsResponseSchema } from '@atlas/schemas';

export const nutritionApi = {
  targets: (from: string, to: string) =>
    apiRequest(`/nutrition/targets?from=${from}&to=${to}`, targetsResponseSchema),
};
