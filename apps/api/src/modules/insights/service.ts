import {
  addDays,
  evaluateInsights,
  muscleVolume,
  relativePerformance,
  SEVERITY_RANK,
  weekStart,
  type CorrelationSeries,
  type InsightMetrics,
  type MuscleCode,
  type PerformedExercise,
} from '@atlas/core';
import type { InsightRow } from '@atlas/db';
import type { InsightDto } from '@atlas/schemas';

import { notFound } from '../../lib/errors';
import type { BodyService } from '../body/service';
import type { ProfileService } from '../profile/service';
import type { RecoveryService } from '../recovery/service';

import type { MetricsData } from './data';
import type { InsightsRepository } from './repository';

const DAY_MS = 86_400_000;

export function toInsightDto(r: InsightRow): InsightDto {
  return {
    id: r.id,
    type: r.type,
    category: r.category,
    severity: r.severity,
    title: r.titlePt,
    body: r.bodyPt,
    data: r.data as Record<string, unknown>,
    status: r.status,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    generatedAt: r.generatedAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
  };
}

const bySeverity = (a: InsightRow, b: InsightRow) =>
  SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
  b.generatedAt.getTime() - a.generatedAt.getTime();

/** Insights determinísticos (P10.1, ADR-050): métricas → regras do core → deduplicação. */
export function createInsightsService(deps: {
  repo: InsightsRepository;
  data: MetricsData;
  profile: ProfileService;
  body: BodyService;
  recovery: () => RecoveryService;
  performedInRange: (userId: string, from: string, to: string) => Promise<PerformedExercise[]>;
}) {
  const { repo, data, profile, body, recovery, performedInRange } = deps;

  /** Correlações das últimas 8 semanas (P9): sono × desempenho, carboidrato × tonelagem, kcal × prontidão. */
  async function correlations(userId: string, today: string): Promise<CorrelationSeries[]> {
    const from = addDays(today, -56);
    const [sessions, checkins, intake] = await Promise.all([
      data.sessions(userId, from, today),
      repo.checkins(userId, from, today),
      repo.dailyIntake(userId, addDays(from, -1), today),
    ]);
    // Desempenho = tonelagem relativa à média das sessões com o mesmo nome no período.
    const perf = relativePerformance(sessions);
    const checkinByDate = new Map(checkins.map((c) => [c.date, c]));
    const completeIntake = new Map(
      intake.filter((d) => d.loggedMeals >= 3).map((d) => [d.date, d]),
    );
    const sleep: [number, number][] = [];
    const carbs: [number, number][] = [];
    for (const p of perf) {
      const c = checkinByDate.get(p.date);
      if (c?.sleepHours !== null && c?.sleepHours !== undefined)
        sleep.push([c.sleepHours, p.index]);
      const prev = completeIntake.get(addDays(p.date, -1));
      if (prev) carbs.push([prev.carbsG, p.index]);
    }
    const kcal: [number, number][] = [];
    for (const c of checkins) {
      const prev = completeIntake.get(addDays(c.date, -1));
      if (prev && c.readiness !== null) kcal.push([prev.kcal, c.readiness]);
    }
    return [
      { type: 'SLEEP_PERFORMANCE_LINK', pairs: sleep },
      { type: 'CARBS_TONNAGE_LINK', pairs: carbs },
      { type: 'KCAL_READINESS_LINK', pairs: kcal },
    ];
  }

  async function metrics(userId: string, today: string): Promise<InsightMetrics> {
    const yesterday = addDays(today, -1);
    const lastWeekStart = addDays(weekStart(today), -7);
    const [
      goal,
      nutritionDays,
      performed,
      ctx,
      strength,
      load,
      trend,
      latest,
      workouts,
      records,
      checkins,
      corr,
    ] = await Promise.all([
      profile.currentGoal(userId, today),
      data.nutritionDays(userId, addDays(today, -28), yesterday, today),
      performedInRange(userId, lastWeekStart, addDays(lastWeekStart, 6)),
      profile.trainingContext(userId),
      data.strength(userId, addDays(today, -13), today),
      recovery().loadRange(userId, addDays(today, -27), today),
      data.trend(userId, addDays(today, -35), today),
      body.latestTrend(userId),
      data.workouts(userId, addDays(today, -14), yesterday),
      repo.e1rmRecordsSince(userId, addDays(today, -2)),
      repo.checkins(userId, addDays(today, -6), today),
      correlations(userId, today),
    ]);
    // Um recorde por exercício e dia (o maior).
    const bestRecord = new Map<string, (typeof records)[number]>();
    for (const r of records) {
      const key = `${r.exerciseId}:${r.date}`;
      const cur = bestRecord.get(key);
      if (!cur || r.value > cur.value) bestRecord.set(key, r);
    }
    return {
      today,
      goal: goal?.primaryGoal ?? null,
      nutritionDays,
      lastWeek: {
        start: lastWeekStart,
        sessions: new Set(performed.map((p) => p.date)).size,
        muscles: muscleVolume(performed).map((v) => ({ muscle: v.muscle, hardSets: v.hardSets })),
        priorities: [...ctx.priorities] as MuscleCode[],
      },
      stagnant: strength.exercises
        .filter((e) => e.stagnant)
        .map((e) => ({ exerciseId: e.exerciseId, name: e.name, bestE1rm: e.bestE1rm })),
      drops: strength.drops,
      load,
      trend,
      lastWeighInDate: latest?.date ?? null,
      workouts,
      records: [...bestRecord.values()].map((r) => ({
        exerciseId: r.exerciseId,
        name: r.name,
        date: r.date,
        e1rm: r.value,
      })),
      readinessWeek: checkins.flatMap((c) => (c.readiness === null ? [] : [c.readiness])),
      correlations: corr,
    };
  }

  return {
    metrics,

    /** Gera e grava os insights do dia; idempotente por (usuário, tipo, chave). */
    async refresh(userId: string, today: string, now = new Date()) {
      const candidates = evaluateInsights(await metrics(userId, today));
      await repo.saveInsights(
        userId,
        now,
        candidates.map((c) => ({
          type: c.type,
          dedupKey: c.key,
          category: c.category,
          severity: c.severity,
          titlePt: c.title,
          bodyPt: c.body,
          data: c.data,
          periodStart: c.periodStart,
          periodEnd: c.periodEnd,
          expiresAt: new Date(now.getTime() + c.ttlDays * DAY_MS),
        })),
      );
      return { generated: candidates.length };
    },

    /** Ativos (não expirados), do mais severo para o menos; sem filtro, exclui dispensados. */
    async list(userId: string, status?: InsightRow['status']) {
      const rows = await repo.listInsights(userId, new Date(), status);
      return { items: rows.sort(bySeverity).map(toInsightDto) };
    },

    /** O mais severo ainda não visto (P12.2). */
    async top(userId: string): Promise<InsightDto | null> {
      const rows = await repo.listInsights(userId, new Date(), 'new');
      const first = rows.sort(bySeverity)[0];
      return first ? toInsightDto(first) : null;
    },

    async setStatus(userId: string, id: string, status: InsightRow['status']) {
      const row = await repo.updateInsightStatus(userId, id, status);
      if (!row) throw notFound('Insight');
      return toInsightDto(row);
    },
  };
}

export type InsightsService = ReturnType<typeof createInsightsService>;
