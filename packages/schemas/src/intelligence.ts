import { z } from 'zod';

import { dayTypeSchema, targetsSchema } from './nutrition';
import { activitySchema, plannedWorkoutSchema, readinessSchema } from './recovery';

const dateSchema = z.iso.date();

// Insights (ADR-050) ----------------------------------------------------------

export const insightStatusSchema = z.enum(['new', 'seen', 'dismissed', 'acted']);
export const insightSeveritySchema = z.enum(['info', 'attention', 'warning']);

export const insightSchema = z.object({
  id: z.uuid(),
  type: z.string(),
  category: z.enum(['training', 'nutrition', 'body', 'recovery', 'integration']),
  severity: insightSeveritySchema,
  title: z.string(),
  body: z.string(),
  data: z.record(z.string(), z.unknown()),
  status: insightStatusSchema,
  periodStart: z.string(),
  periodEnd: z.string(),
  generatedAt: z.string(),
  expiresAt: z.string(),
});
export type InsightDto = z.infer<typeof insightSchema>;

export const insightListSchema = z.object({ items: z.array(insightSchema) });
export type InsightList = z.infer<typeof insightListSchema>;
export const insightsQuerySchema = z.object({ status: insightStatusSchema.optional() });
export const insightPatchSchema = z.object({ status: insightStatusSchema });
export const insightRefreshSchema = z.object({ generated: z.number().int() });

// GET adaptativo (P5.3) ---------------------------------------------------------

export const energyEstimateSchema = z.object({
  weekStart: z.string(),
  tdeeFormula: z.number(),
  tdeeObserved: z.number().nullable(),
  tdeeUsed: z.number(),
  confidence: z.enum(['low', 'medium', 'high']),
  weightTrendKg: z.number().nullable(),
  intakeAvgKcal: z.number().nullable(),
  loggedDays: z.number().int(),
  weighInCount: z.number().int(),
});
export type EnergyEstimateDto = z.infer<typeof energyEstimateSchema>;
export const energyEstimatesSchema = z.object({
  /** Estimativa em uso nas metas (confiança média ou alta), se houver. */
  current: energyEstimateSchema.nullable(),
  items: z.array(energyEstimateSchema),
});
export type EnergyEstimates = z.infer<typeof energyEstimatesSchema>;

// Contexto do dia (P9) ------------------------------------------------------------

export const contextFlagSchema = z.enum([
  'LOW_PROTEIN_TODAY',
  'SPORT_YESTERDAY',
  'POOR_SLEEP',
  'HIGH_ACWR',
]);

export const dailyContextSchema = z.object({
  date: z.string(),
  dayType: dayTypeSchema.nullable(),
  readiness: readinessSchema,
  training: z.object({
    planned: plannedWorkoutSchema.nullable(),
    adapted: z
      .object({
        mode: z.enum(['normal', 'reduced', 'light', 'rest']),
        changed: z.boolean(),
        explanation: z.array(z.string()),
      })
      .nullable(),
    done: z
      .object({
        id: z.uuid(),
        name: z.string(),
        durationMin: z.number().nullable(),
        sessionRpe: z.number().nullable(),
        tonnage: z.number(),
        hardSets: z.number(),
      })
      .nullable(),
  }),
  activities: z.array(activitySchema),
  load: z.object({
    dayAU: z.number(),
    acute7d: z.number(),
    chronic28d: z.number(),
    acwr: z.number().nullable(),
  }),
  nutrition: z.object({
    targets: targetsSchema.nullable(),
    consumed: targetsSchema,
    planned: targetsSchema,
    remaining: targetsSchema.nullable(),
    loggedMeals: z.number().int(),
    /** Refeições registradas / 3, até 1 (ADR-051). */
    completeness: z.number(),
  }),
  body: z.object({
    weightTrendKg: z.number().nullable(),
    lastWeighInDaysAgo: z.number().int().nullable(),
  }),
  flags: z.array(contextFlagSchema),
  /** Insight mais severo ainda não visto (P12.2). */
  topInsight: insightSchema.nullable(),
});
export type DailyContextDto = z.infer<typeof dailyContextSchema>;

// Análise de período (P12.6) ---------------------------------------------------------

const n = z.number().nullable();

export const periodSummarySchema = z.object({
  from: z.string(),
  to: z.string(),
  days: z.number().int(),
  training: z.object({
    sessions: z.number().int(),
    sessionsPerWeek: z.number(),
    tonnage: z.number(),
    hardSets: z.number(),
    avgRpe: n,
    planned: z.number().int(),
    done: z.number().int(),
    adherencePct: n,
  }),
  nutrition: z.object({
    loggedDays: z.number().int(),
    completeDays: z.number().int(),
    avgKcal: n,
    avgProteinG: n,
    avgCarbsG: n,
    avgFatG: n,
    proteinAdherencePct: n,
    kcalAdherencePct: n,
    byDayType: z.array(
      z.object({
        dayType: dayTypeSchema,
        days: z.number().int(),
        kcal: z.number(),
        proteinG: z.number(),
        carbsG: z.number(),
        fatG: z.number(),
        targetKcal: n,
      }),
    ),
  }),
  body: z.object({
    startTrendKg: n,
    endTrendKg: n,
    changeKg: n,
    ratePctPerWeek: n,
    weighIns: z.number().int(),
  }),
  recovery: z.object({
    avgSleepHours: n,
    avgReadiness: n,
    checkins: z.number().int(),
    avgAcute7d: n,
    lastAcwr: n,
  }),
});
export type PeriodSummaryDto = z.infer<typeof periodSummarySchema>;

export const analyticsSummarySchema = z.object({
  summary: periodSummarySchema,
  /** Uma linha por dia do período (calendário e gráficos). */
  days: z.array(
    z.object({
      date: z.string(),
      trained: z.boolean(),
      sessionTonnage: z.number(),
      completeDay: z.boolean(),
      kcal: z.number(),
      proteinG: z.number(),
      targetKcal: n,
      targetProteinG: n,
      weightKg: n,
      trendKg: n,
      sleepHours: n,
      readiness: n,
      acute7d: z.number(),
      chronic28d: z.number(),
      acwr: n,
    }),
  ),
  strength: z.array(
    z.object({
      exerciseId: z.uuid(),
      name: z.string(),
      sessions: z.number().int(),
      firstE1rm: z.number(),
      lastE1rm: z.number(),
      bestE1rm: z.number(),
      changePct: z.number(),
      stagnant: z.boolean(),
      points: z.array(z.object({ date: z.string(), e1rm: z.number() })),
    }),
  ),
  /** Séries duras por músculo por semana (média no período) e faixas. */
  volume: z.array(
    z.object({
      muscle: z.string(),
      namePt: z.string(),
      hardSetsPerWeek: z.number(),
      status: z.enum(['below_mev', 'minimum', 'productive', 'high', 'above_mrv']),
    }),
  ),
  goal: z
    .object({
      primaryGoal: z.string(),
      targetRatePctPerWeek: n,
    })
    .nullable(),
});
export type AnalyticsSummary = z.infer<typeof analyticsSummarySchema>;

export const analyticsSummaryQuerySchema = z
  .object({ from: dateSchema, to: dateSchema })
  .refine((q) => q.from <= q.to, {
    message: 'A data inicial deve ser anterior à final',
    path: ['from'],
  });

export const analyticsCompareQuerySchema = z
  .object({ aFrom: dateSchema, aTo: dateSchema, bFrom: dateSchema, bTo: dateSchema })
  .refine((q) => q.aFrom <= q.aTo && q.bFrom <= q.bTo, {
    message: 'Cada período deve começar antes de terminar',
    path: ['aFrom'],
  });

export const analyticsCompareSchema = z.object({
  a: periodSummarySchema,
  b: periodSummarySchema,
  deltas: z.array(z.object({ metric: z.string(), a: n, b: n, delta: n, deltaPct: n })),
});
export type AnalyticsCompare = z.infer<typeof analyticsCompareSchema>;
