import { apiRequest } from '@/lib/api';
import {
  analyticsCompareSchema,
  analyticsSummarySchema,
  dailyContextSchema,
  energyEstimatesSchema,
  insightListSchema,
  insightSchema,
  type InsightDto,
} from '@atlas/schemas';

export const insightsApi = {
  context: (date: string) => apiRequest(`/daily-context/${date}`, dailyContextSchema),
  list: () => apiRequest('/insights', insightListSchema),
  setStatus: (id: string, status: InsightDto['status']) =>
    apiRequest(`/insights/${id}`, insightSchema, { method: 'PATCH', body: { status } }),
  summary: (from: string, to: string) =>
    apiRequest(`/analytics/summary?from=${from}&to=${to}`, analyticsSummarySchema),
  compare: (a: { from: string; to: string }, b: { from: string; to: string }) =>
    apiRequest(
      `/analytics/compare?aFrom=${a.from}&aTo=${a.to}&bFrom=${b.from}&bTo=${b.to}`,
      analyticsCompareSchema,
    ),
  energy: () => apiRequest('/nutrition/energy-estimates', energyEstimatesSchema),
};
