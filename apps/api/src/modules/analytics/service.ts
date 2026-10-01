import {
  addDays,
  comparePeriods,
  dateRange,
  daysBetween,
  muscleVolume,
  periodSummary,
  volumeStatus,
  weekStart,
  type MuscleCode,
} from '@atlas/core';
import {
  muscleCodes,
  type AnalyticsCompare,
  type AnalyticsSummary,
  type MuscleVolumeDto,
} from '@atlas/schemas';

import { validationError } from '../../lib/errors';
import type { ExercisesService } from '../exercises/service';
import type { MetricsData } from '../insights/data';
import type { InsightsRepository } from '../insights/repository';
import type { ProfileService } from '../profile/service';
import type { RecoveryService } from '../recovery/service';
import type { TrainingService } from '../training/service';

/** Maior período aceito no resumo (dias). */
const MAX_PERIOD_DAYS = 400;

export function createAnalyticsService(deps: {
  training: TrainingService;
  exercises: ExercisesService;
  profile: ProfileService;
  data: MetricsData;
  insightsRepo: InsightsRepository;
  recovery: () => RecoveryService;
}) {
  const { training, exercises, profile, data, insightsRepo, recovery } = deps;

  function checkRange(from: string, to: string) {
    if (daysBetween(from, to) + 1 > MAX_PERIOD_DAYS)
      throw validationError([
        { field: 'from', message: `Período máximo de ${MAX_PERIOD_DAYS} dias` },
      ]);
  }

  /** Dados do período até hoje (o futuro não entra). */
  async function gather(userId: string, from: string, to: string, today: string) {
    const end = to > today ? today : to;
    const empty = end < from;
    const last = empty ? from : end;
    const [sessions, nutritionDays, workouts, trend, checkins, load] = await Promise.all([
      empty ? [] : data.sessions(userId, from, last),
      empty ? [] : data.nutritionDays(userId, from, last, today),
      // Aderência só até ontem: o treino de hoje ainda pode ser feito.
      data.workouts(userId, from, end < today ? end : addDays(today, -1)),
      empty ? [] : data.trend(userId, from, last),
      empty ? [] : insightsRepo.checkins(userId, from, last),
      empty ? [] : recovery().loadRange(userId, from, last),
    ]);
    const summary = periodSummary({
      from,
      to: last,
      sessions,
      workouts,
      nutritionDays,
      trend,
      checkins,
      load,
    });
    return { summary, sessions, nutritionDays, trend, checkins, load, last, empty };
  }

  return {
    /** Volume semanal (seg–dom) por músculo com faixas MEV/produtiva/MRV (P8.1/P8.2). */
    async muscleVolume(userId: string, today: string, start?: string): Promise<MuscleVolumeDto> {
      const from = weekStart(start ?? today);
      const to = addDays(from, 6);
      const [performed, names, ctx] = await Promise.all([
        training.performedInRange(userId, from, to),
        exercises.muscleNames(),
        profile.trainingContext(userId),
      ]);
      const byMuscle = new Map(muscleVolume(performed).map((v) => [v.muscle, v]));
      const items = muscleCodes.map((muscle: MuscleCode) => {
        const v = byMuscle.get(muscle);
        const hardSets = v?.hardSets ?? 0;
        return {
          muscle,
          namePt: names.get(muscle) ?? muscle,
          hardSets,
          frequency: v?.frequency ?? 0,
          ...volumeStatus(muscle, hardSets, { priority: ctx.priorities.has(muscle) }),
        };
      });
      return { weekStart: from, weekEnd: to, items };
    },

    /** Progresso de um período (P12.6): resumo, série diária, força, volume e objetivo. */
    async summary(
      userId: string,
      from: string,
      to: string,
      today: string,
    ): Promise<AnalyticsSummary> {
      checkRange(from, to);
      const g = await gather(userId, from, to, today);
      const [strength, performed, names, ctx, goal] = await Promise.all([
        g.empty ? { exercises: [], drops: [] } : data.strength(userId, from, g.last),
        g.empty ? [] : training.performedInRange(userId, from, g.last),
        exercises.muscleNames(),
        profile.trainingContext(userId),
        profile.currentGoal(userId, g.last),
      ]);
      const weeks = Math.max(1, (daysBetween(from, g.last) + 1) / 7);
      const volume = muscleVolume(performed).map((v) => {
        const perWeek = Math.round((v.hardSets / weeks) * 10) / 10;
        return {
          muscle: v.muscle,
          namePt: names.get(v.muscle) ?? v.muscle,
          hardSetsPerWeek: perWeek,
          status: volumeStatus(v.muscle, perWeek, { priority: ctx.priorities.has(v.muscle) })
            .status,
        };
      });
      const tonnageByDate = new Map<string, number>();
      for (const s of g.sessions)
        tonnageByDate.set(s.date, (tonnageByDate.get(s.date) ?? 0) + s.tonnage);
      const nutritionByDate = new Map(g.nutritionDays.map((d) => [d.date, d]));
      const trendByDate = new Map(g.trend.map((p) => [p.date, p]));
      const checkinByDate = new Map(g.checkins.map((c) => [c.date, c]));
      const loadByDate = new Map(g.load.map((l) => [l.date, l]));
      const days = g.empty
        ? []
        : dateRange(from, g.last).map((date) => {
            const n = nutritionByDate.get(date);
            const p = trendByDate.get(date);
            const c = checkinByDate.get(date);
            const l = loadByDate.get(date);
            return {
              date,
              trained: n?.trained ?? tonnageByDate.has(date),
              sessionTonnage: Math.round(tonnageByDate.get(date) ?? 0),
              completeDay: (n?.loggedMeals ?? 0) >= 3,
              kcal: Math.round(n?.kcal ?? 0),
              proteinG: Math.round(n?.proteinG ?? 0),
              targetKcal: n?.targetKcal ?? null,
              targetProteinG: n?.targetProteinG ?? null,
              weightKg: p ? Math.round(p.weightKg * 100) / 100 : null,
              trendKg: p ? Math.round(p.trendKg * 100) / 100 : null,
              sleepHours: c?.sleepHours ?? null,
              readiness: c?.readiness ?? null,
              acute7d: Math.round(l?.acute7d ?? 0),
              chronic28d: Math.round(l?.chronic28d ?? 0),
              acwr:
                l?.acwr === null || l?.acwr === undefined ? null : Math.round(l.acwr * 100) / 100,
            };
          });
      return {
        summary: g.summary,
        days,
        strength: strength.exercises.slice(0, 12).map((e) => ({
          ...e,
          firstE1rm: Math.round(e.firstE1rm * 10) / 10,
          lastE1rm: Math.round(e.lastE1rm * 10) / 10,
          bestE1rm: Math.round(e.bestE1rm * 10) / 10,
          changePct: Math.round(e.changePct * 10) / 10,
          points: e.points.map((p) => ({ date: p.date, e1rm: Math.round(p.e1rm * 10) / 10 })),
        })),
        volume,
        goal: goal
          ? { primaryGoal: goal.primaryGoal, targetRatePctPerWeek: goal.targetRatePctPerWeek }
          : null,
      };
    },

    /** Compara dois períodos (B em relação a A). */
    async compare(
      userId: string,
      q: { aFrom: string; aTo: string; bFrom: string; bTo: string },
      today: string,
    ): Promise<AnalyticsCompare> {
      checkRange(q.aFrom, q.aTo);
      checkRange(q.bFrom, q.bTo);
      const [a, b] = await Promise.all([
        gather(userId, q.aFrom, q.aTo, today),
        gather(userId, q.bFrom, q.bTo, today),
      ]);
      return { a: a.summary, b: b.summary, deltas: comparePeriods(a.summary, b.summary) };
    },
  };
}

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
