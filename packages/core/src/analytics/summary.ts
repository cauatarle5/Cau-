import { daysBetween } from '../body/age';
import type { TrendPoint } from '../body/weight-trend';
import { mean } from '../insights/stats';
import type { DayType } from '../nutrition/day-type';
import type { LoadSnapshot } from '../recovery/load';

export interface PeriodInput {
  from: string;
  to: string;
  sessions: readonly { date: string; tonnage: number; hardSets: number; rpe: number | null }[];
  /** Treinos agendados no período (até ontem) e quantos foram feitos. */
  workouts: { planned: number; done: number };
  nutritionDays: readonly {
    date: string;
    dayType: DayType;
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    loggedMeals: number;
    targetKcal: number | null;
    targetProteinG: number | null;
  }[];
  /** Pontos de tendência dentro do período. */
  trend: readonly TrendPoint[];
  checkins: readonly { date: string; sleepHours: number | null; readiness: number | null }[];
  load: readonly LoadSnapshot[];
}

export interface DayTypeAverage {
  dayType: DayType;
  days: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  targetKcal: number | null;
}

export interface PeriodSummary {
  from: string;
  to: string;
  days: number;
  training: {
    sessions: number;
    sessionsPerWeek: number;
    tonnage: number;
    hardSets: number;
    avgRpe: number | null;
    planned: number;
    done: number;
    adherencePct: number | null;
  };
  nutrition: {
    loggedDays: number;
    completeDays: number;
    avgKcal: number | null;
    avgProteinG: number | null;
    avgCarbsG: number | null;
    avgFatG: number | null;
    /** Dias completos com proteína ≥ 90% da meta / dias completos com meta. */
    proteinAdherencePct: number | null;
    /** Dias completos com kcal entre 90% e 110% da meta. */
    kcalAdherencePct: number | null;
    byDayType: DayTypeAverage[];
  };
  body: {
    startTrendKg: number | null;
    endTrendKg: number | null;
    changeKg: number | null;
    ratePctPerWeek: number | null;
    weighIns: number;
  };
  recovery: {
    avgSleepHours: number | null;
    avgReadiness: number | null;
    checkins: number;
    avgAcute7d: number | null;
    lastAcwr: number | null;
  };
}

const r = (n: number | null, d = 0) => (n === null ? null : Math.round(n * 10 ** d) / 10 ** d);
const pct = (num: number, den: number) => (den > 0 ? r((num / den) * 100, 1) : null);

/** Resumo de um período (P12.6): treino, aderência, nutrição por tipo de dia, corpo e recuperação. */
export function periodSummary(p: PeriodInput): PeriodSummary {
  const days = daysBetween(p.from, p.to) + 1;
  const complete = p.nutritionDays.filter((d) => d.loggedMeals >= 3);
  const withTargets = complete.filter((d) => d.targetKcal !== null && d.targetProteinG !== null);
  const rpes = p.sessions.flatMap((s) => (s.rpe === null ? [] : [s.rpe]));

  const types = new Map<DayType, typeof complete>();
  for (const d of complete) types.set(d.dayType, [...(types.get(d.dayType) ?? []), d]);
  const byDayType: DayTypeAverage[] = [...types.entries()].map(([dayType, list]) => {
    const targets = list.flatMap((d) => (d.targetKcal === null ? [] : [d.targetKcal]));
    return {
      dayType,
      days: list.length,
      kcal: r(mean(list.map((d) => d.kcal))) ?? 0,
      proteinG: r(mean(list.map((d) => d.proteinG))) ?? 0,
      carbsG: r(mean(list.map((d) => d.carbsG))) ?? 0,
      fatG: r(mean(list.map((d) => d.fatG))) ?? 0,
      targetKcal: r(mean(targets)),
    };
  });
  const ORDER: DayType[] = ['rest', 'training', 'hard_training', 'sport', 'sport_and_training'];
  byDayType.sort((a, b) => ORDER.indexOf(a.dayType) - ORDER.indexOf(b.dayType));

  const first = p.trend[0];
  const last = p.trend.at(-1);
  const span = first && last ? daysBetween(first.date, last.date) : 0;
  const change = first && last && span > 0 ? last.trendKg - first.trendKg : null;
  const sleeps = p.checkins.flatMap((c) => (c.sleepHours === null ? [] : [c.sleepHours]));
  const readiness = p.checkins.flatMap((c) => (c.readiness === null ? [] : [c.readiness]));

  return {
    from: p.from,
    to: p.to,
    days,
    training: {
      sessions: p.sessions.length,
      sessionsPerWeek: r((p.sessions.length / days) * 7, 1) ?? 0,
      tonnage: Math.round(p.sessions.reduce((a, s) => a + s.tonnage, 0)),
      hardSets: p.sessions.reduce((a, s) => a + s.hardSets, 0),
      avgRpe: r(mean(rpes), 1),
      planned: p.workouts.planned,
      done: p.workouts.done,
      adherencePct: pct(p.workouts.done, p.workouts.planned),
    },
    nutrition: {
      loggedDays: p.nutritionDays.filter((d) => d.loggedMeals > 0).length,
      completeDays: complete.length,
      avgKcal: r(mean(complete.map((d) => d.kcal))),
      avgProteinG: r(mean(complete.map((d) => d.proteinG))),
      avgCarbsG: r(mean(complete.map((d) => d.carbsG))),
      avgFatG: r(mean(complete.map((d) => d.fatG))),
      proteinAdherencePct: pct(
        withTargets.filter((d) => d.proteinG >= 0.9 * (d.targetProteinG ?? 0)).length,
        withTargets.length,
      ),
      kcalAdherencePct: pct(
        withTargets.filter(
          (d) => d.kcal >= 0.9 * (d.targetKcal ?? 0) && d.kcal <= 1.1 * (d.targetKcal ?? 0),
        ).length,
        withTargets.length,
      ),
      byDayType,
    },
    body: {
      startTrendKg: r(first?.trendKg ?? null, 2),
      endTrendKg: r(last?.trendKg ?? null, 2),
      changeKg: r(change, 2),
      ratePctPerWeek:
        change !== null && first ? r((change / first.trendKg) * 100 * (7 / span), 2) : null,
      weighIns: p.trend.length,
    },
    recovery: {
      avgSleepHours: r(mean(sleeps), 1),
      avgReadiness: r(mean(readiness)),
      checkins: p.checkins.length,
      avgAcute7d: r(mean(p.load.map((l) => l.acute7d))),
      lastAcwr: r(p.load.at(-1)?.acwr ?? null, 2),
    },
  };
}

/** Métricas comparadas entre períodos (A × B). */
export const COMPARE_METRICS = [
  ['training', 'sessionsPerWeek'],
  ['training', 'tonnage'],
  ['training', 'hardSets'],
  ['training', 'adherencePct'],
  ['nutrition', 'completeDays'],
  ['nutrition', 'avgKcal'],
  ['nutrition', 'avgProteinG'],
  ['nutrition', 'proteinAdherencePct'],
  ['body', 'changeKg'],
  ['body', 'ratePctPerWeek'],
  ['recovery', 'avgSleepHours'],
  ['recovery', 'avgReadiness'],
] as const;

export interface MetricDelta {
  metric: string;
  a: number | null;
  b: number | null;
  /** b − a; `null` se faltar um dos lados. */
  delta: number | null;
  /** (b − a) / |a| em %; `null` sem base. */
  deltaPct: number | null;
}

/** Compara dois resumos: B (atual) em relação a A (referência). */
export function comparePeriods(a: PeriodSummary, b: PeriodSummary): MetricDelta[] {
  return COMPARE_METRICS.map(([section, key]) => {
    const va = (a[section] as unknown as Record<string, number | null>)[key] ?? null;
    const vb = (b[section] as unknown as Record<string, number | null>)[key] ?? null;
    const delta = va !== null && vb !== null ? r(vb - va, 2) : null;
    return {
      metric: `${section}.${key}`,
      a: va,
      b: vb,
      delta,
      deltaPct:
        delta !== null && va !== null && va !== 0 ? r((delta / Math.abs(va)) * 100, 1) : null,
    };
  });
}
