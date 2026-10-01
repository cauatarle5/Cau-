import { apiRequest } from '@/lib/api';
import type {
  analyticsCompareSchema,
  analyticsSummarySchema,
  dailyContextSchema,
  energyEstimatesSchema,
  insightListSchema,
  insightSchema,
} from '@atlas/schemas';
import { type InsightDto } from '@atlas/schemas';

export const insightsApi = {
  context: (date: string) => apiRequest<typeof dailyContextSchema>(`/daily-context/${date}`),
  list: () => apiRequest<typeof insightListSchema>('/insights'),
  setStatus: (id: string, status: InsightDto['status']) =>
    apiRequest<typeof insightSchema>(`/insights/${id}`, { method: 'PATCH', body: { status } }),
  summary: (from: string, to: string) =>
    apiRequest<typeof analyticsSummarySchema>(`/analytics/summary?from=${from}&to=${to}`),
  compare: (a: { from: string; to: string }, b: { from: string; to: string }) =>
    apiRequest<typeof analyticsCompareSchema>(
      `/analytics/compare?aFrom=${a.from}&aTo=${a.to}&bFrom=${b.from}&bTo=${b.to}`,
    ),
  energy: () => apiRequest<typeof energyEstimatesSchema>('/nutrition/energy-estimates'),
};
