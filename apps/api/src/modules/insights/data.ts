import {
  addDays,
  bestE1rm,
  dateRange,
  isHardSet,
  isStagnant,
  performanceDrop,
  tonnage,
  type NutritionDay,
  type SetLike,
} from '@atlas/core';
import type { SetLogRow } from '@atlas/db';

import type { BodyService } from '../body/service';
import type { ExercisesService } from '../exercises/service';
import type { NutritionService } from '../nutrition/service';
import type { RecoveryService } from '../recovery/service';
import { exposuresFor } from '../training/agenda';
import type { TrainingRepository } from '../training/repository';

import type { InsightsRepository } from './repository';

const toSetLike = (s: SetLogRow): SetLike => ({
  setType: s.setType,
  loadKg: s.loadKg,
  reps: s.reps,
  rir: s.rir,
  rpe: s.rpe,
  completed: s.completed,
});

export interface SessionMetric {
  id: string;
  date: string;
  name: string;
  tonnage: number;
  hardSets: number;
  rpe: number | null;
}

export interface StrengthMetric {
  exerciseId: string;
  name: string;
  sessions: number;
  firstE1rm: number;
  lastE1rm: number;
  bestE1rm: number;
  changePct: number;
  stagnant: boolean;
  points: { date: string; e1rm: number }[];
}

/**
 * Leitura das séries de métricas usadas pelo resumo de período, pelo GET adaptativo e pelos
 * insights. Tudo filtrado por usuário; os cálculos ficam no core.
 */
export function createMetricsData(deps: {
  repo: InsightsRepository;
  trainingRepo: TrainingRepository;
  exercises: ExercisesService;
  nutrition: NutritionService;
  recovery: () => RecoveryService;
  body: BodyService;
}) {
  const { repo, trainingRepo, exercises, nutrition, recovery, body } = deps;

  async function sessions(userId: string, from: string, to: string): Promise<SessionMetric[]> {
    const {
      sessions: rows,
      exercises: exs,
      sets,
    } = await trainingRepo.listSessions(userId, from, to);
    return rows
      .map((s) => {
        const seIds = new Set(exs.filter((e) => e.sessionId === s.id).map((e) => e.id));
        const own = sets.filter((x) => seIds.has(x.sessionExerciseId)).map(toSetLike);
        return {
          id: s.id,
          date: s.date,
          name: s.name,
          tonnage: tonnage(own),
          hardSets: own.filter(isHardSet).length,
          rpe: s.sessionRpe,
        };
      })
      .filter((s) => s.tonnage > 0 || s.hardSets > 0)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  /** Dias com consumido, meta e tipo do dia; `to` deve ser ≤ hoje. */
  async function nutritionDays(
    userId: string,
    from: string,
    to: string,
    today: string,
  ): Promise<NutritionDay[]> {
    const [intake, targets, sess, acts] = await Promise.all([
      repo.dailyIntake(userId, from, to),
      nutrition.targets(userId, from, to, today),
      sessions(userId, from, to),
      recovery().listActivities(userId, from, to),
    ]);
    const byDate = new Map(intake.map((d) => [d.date, d]));
    const targetByDate = new Map(targets.days.map((d) => [d.date, d]));
    const trained = new Set([...sess.map((s) => s.date), ...acts.map((a) => a.date)]);
    return dateRange(from, to).map((date) => {
      const d = byDate.get(date);
      const t = targetByDate.get(date);
      return {
        date,
        kcal: d?.kcal ?? 0,
        proteinG: d?.proteinG ?? 0,
        carbsG: d?.carbsG ?? 0,
        fatG: d?.fatG ?? 0,
        loggedMeals: d?.loggedMeals ?? 0,
        dayType: t?.dayType ?? 'rest',
        trained: trained.has(date),
        targetKcal: t?.kcal ?? null,
        targetProteinG: t?.proteinG ?? null,
      };
    });
  }

  /** Treinos agendados no intervalo e quantos tiveram sessão. */
  async function workouts(userId: string, from: string, to: string) {
    if (to < from) return { planned: 0, done: 0 };
    const rows = await trainingRepo.listPlanned(userId, { from, to });
    return { planned: rows.length, done: rows.filter((r) => r.sessionId !== null).length };
  }

  /**
   * e1RM por exercício feito no intervalo: primeiro, último, melhor, variação e estagnação
   * (P8.4, com todo o histórico até `to`). Também devolve as quedas de desempenho dos 7 dias
   * que terminam em `to`.
   */
  async function strength(userId: string, from: string, to: string) {
    const inRange = await trainingRepo.setsInRange(userId, from, to);
    const ids = [...new Set(inRange.map((s) => s.exerciseId))];
    if (ids.length === 0) return { exercises: [] as StrengthMetric[], drops: [] };
    const [history, bundles] = await Promise.all([
      trainingRepo.historySets(userId, ids),
      exercises.bundles(userId, ids),
    ]);
    const names = new Map(bundles.map((b) => [b.exercise.id, b.exercise.namePt]));
    const upTo = history.filter((h) => h.date <= to);
    const out: StrengthMetric[] = [];
    const drops: {
      exerciseId: string;
      name: string;
      date: string;
      e1rm: number;
      previousMean: number;
    }[] = [];
    for (const id of ids) {
      const exposures = exposuresFor(upTo, id);
      const all = exposures
        .map((e) => ({ date: e.date, e1rm: bestE1rm(e.sets) }))
        .filter((p): p is { date: string; e1rm: number } => p.e1rm !== null);
      const points = all.filter((p) => p.date >= from);
      const first = points[0];
      const last = points.at(-1);
      const name = names.get(id) ?? '';
      if (!first || !last) continue;
      out.push({
        exerciseId: id,
        name,
        sessions: points.length,
        firstE1rm: first.e1rm,
        lastE1rm: last.e1rm,
        bestE1rm: Math.max(...points.map((p) => p.e1rm)),
        changePct: ((last.e1rm - first.e1rm) / first.e1rm) * 100,
        stagnant: isStagnant(exposures, to),
        points,
      });
      all.forEach((p, i) => {
        if (p.date < addDays(to, -6)) return;
        const previous = all.slice(Math.max(0, i - 3), i).map((x) => x.e1rm);
        if (performanceDrop(p.e1rm, previous)) {
          drops.push({
            exerciseId: id,
            name,
            date: p.date,
            e1rm: p.e1rm,
            previousMean: previous.reduce((a, b) => a + b, 0) / previous.length,
          });
        }
      });
    }
    out.sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
    return { exercises: out, drops };
  }

  async function trend(userId: string, from: string, to: string) {
    return (await body.trend(userId, from, to)).points;
  }

  return { sessions, nutritionDays, workouts, strength, trend };
}

export type MetricsData = ReturnType<typeof createMetricsData>;
