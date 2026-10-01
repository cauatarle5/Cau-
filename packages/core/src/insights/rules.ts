import { daysBetween } from '../body/age';
import { addDays } from '../body/dates';
import type { TrendPoint } from '../body/weight-trend';
import type { DayType } from '../nutrition/day-type';
import type { PrimaryGoal } from '../nutrition/types';
import type { LoadSnapshot } from '../recovery/load';
import { volumeStatus, type MuscleCode } from '../training/volume';

import { mean, pearson } from './stats';

export type InsightCategory = 'training' | 'nutrition' | 'body' | 'recovery' | 'integration';
export type InsightSeverity = 'info' | 'attention' | 'warning';
export type InsightType =
  | 'LOW_PROTEIN_STREAK'
  | 'MUSCLE_BELOW_MEV'
  | 'EXERCISE_STAGNANT'
  | 'PERFORMANCE_DROP'
  | 'HIGH_ACWR'
  | 'DETRAINING'
  | 'HIGH_MONOTONY'
  | 'WEIGHT_LOSS_TOO_FAST'
  | 'WEIGHT_TREND_OFF_GOAL'
  | 'LOW_CONSISTENCY'
  | 'NEW_PR'
  | 'MISSED_WEIGH_INS'
  | 'LOW_ENERGY_HARD_DAYS'
  | 'EARLY_DELOAD'
  | 'SLEEP_PERFORMANCE_LINK'
  | 'CARBS_TONNAGE_LINK'
  | 'KCAL_READINESS_LINK';

export interface InsightCandidate {
  type: InsightType;
  category: InsightCategory;
  severity: InsightSeverity;
  /** Chave de deduplicação dentro do tipo (ADR-050). */
  key: string;
  title: string;
  body: string;
  /** Números que sustentam o insight. */
  data: Record<string, unknown>;
  periodStart: string;
  periodEnd: string;
  ttlDays: number;
}

export const SEVERITY_RANK: Record<InsightSeverity, number> = { warning: 3, attention: 2, info: 1 };

const nf = (d: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
/** Número em pt-BR (vírgula decimal). */
export const fmt = (n: number, decimals = 0) => nf(decimals).format(n);

const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

export interface NutritionDay {
  date: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  loggedMeals: number;
  dayType: DayType;
  /** Houve musculação ou esporte no dia. */
  trained: boolean;
  targetKcal: number | null;
  targetProteinG: number | null;
}

export interface CorrelationSeries {
  type: 'SLEEP_PERFORMANCE_LINK' | 'CARBS_TONNAGE_LINK' | 'KCAL_READINESS_LINK';
  /** Pares diários alinhados (x do dia/noite anterior, y do dia). */
  pairs: readonly (readonly [number, number])[];
}

export interface InsightMetrics {
  today: string;
  goal: PrimaryGoal | null;
  /** Dias passados (até 28, sem hoje) com o consumido e a meta. */
  nutritionDays: readonly NutritionDay[];
  /** Última semana completa (seg–dom) com o volume por músculo. */
  lastWeek: {
    start: string;
    sessions: number;
    muscles: readonly { muscle: MuscleCode; hardSets: number }[];
    priorities: readonly MuscleCode[];
  } | null;
  stagnant: readonly { exerciseId: string; name: string; bestE1rm: number }[];
  /** Exercícios com queda de desempenho (P8.4) nos últimos 7 dias. */
  drops: readonly {
    exerciseId: string;
    name: string;
    date: string;
    e1rm: number;
    previousMean: number;
  }[];
  /** Série de carga dos últimos 28 dias (até hoje). */
  load: readonly LoadSnapshot[];
  /** Pontos de tendência (dias com pesagem) dos últimos ~35 dias. */
  trend: readonly TrendPoint[];
  lastWeighInDate: string | null;
  /** Treinos agendados nos últimos 14 dias (até ontem) e quantos foram feitos. */
  workouts: { planned: number; done: number };
  /** Recordes dos últimos 3 dias. */
  records: readonly { exerciseId: string; name: string; date: string; e1rm: number }[];
  /** Prontidão dos check-ins dos últimos 7 dias. */
  readinessWeek: readonly number[];
  correlations: readonly CorrelationSeries[];
}

const base = (today: string, from: string) => ({ periodStart: from, periodEnd: today, ttlDays: 7 });

/** Proteína < 80% da meta em 3 dos últimos 5 dias com treino (P9). */
export function lowProteinStreak(m: InsightMetrics): InsightCandidate | null {
  const days = m.nutritionDays
    .filter((d) => d.trained && d.loggedMeals > 0 && d.targetProteinG !== null)
    .slice(-5);
  const low = days.filter((d) => d.proteinG < 0.8 * (d.targetProteinG ?? 0));
  if (low.length < 3) return null;
  const avgPct = mean(low.map((d) => (d.proteinG / (d.targetProteinG ?? 1)) * 100)) ?? 0;
  return {
    type: 'LOW_PROTEIN_STREAK',
    category: 'nutrition',
    severity: 'attention',
    key: 'main',
    title: 'Proteína abaixo da meta nos dias de treino',
    body: `Em ${low.length} dos últimos ${days.length} dias de treino a proteína ficou abaixo de 80% da meta (média de ${fmt(avgPct)}% nesses dias). Distribuir proteína nas refeições ajuda a recuperação.`,
    data: {
      days: days.length,
      lowDays: low.map((d) => ({
        date: d.date,
        proteinG: round(d.proteinG),
        targetG: d.targetProteinG,
      })),
      avgPct: round(avgPct, 1),
    },
    ...base(m.today, days[0]?.date ?? m.today),
  };
}

/** Músculos principais que alertam abaixo do MEV mesmo sem treino na semana. */
const MAIN_MUSCLES: readonly MuscleCode[] = [
  'chest',
  'lats',
  'upper_back',
  'side_delts',
  'quads',
  'hamstrings',
  'glutes',
  'biceps',
  'triceps',
];

/** Músculos abaixo do MEV na última semana completa (P8.2), com ao menos 2 treinos. */
export function muscleBelowMev(m: InsightMetrics): InsightCandidate | null {
  const w = m.lastWeek;
  if (!w || w.sessions < 2) return null;
  const sets = new Map(w.muscles.map((x) => [x.muscle, x.hardSets]));
  const candidates = new Set<MuscleCode>([...MAIN_MUSCLES, ...w.priorities, ...sets.keys()]);
  const below = [...candidates]
    .map((muscle) => ({ muscle, hardSets: round(sets.get(muscle) ?? 0, 1) }))
    .filter((x) => {
      const s = volumeStatus(x.muscle, x.hardSets, { priority: w.priorities.includes(x.muscle) });
      return s.status === 'below_mev' && s.alert;
    })
    .sort((a, b) => a.hardSets - b.hardSets);
  if (below.length === 0) return null;
  return {
    type: 'MUSCLE_BELOW_MEV',
    category: 'training',
    severity: 'info',
    key: w.start,
    title: 'Volume abaixo do mínimo em alguns músculos',
    body: `Na semana de ${w.start.slice(8, 10)}/${w.start.slice(5, 7)}, ${below.length} músculo(s) ficaram abaixo de 8 séries duras.`,
    data: { weekStart: w.start, muscles: below, mev: 8 },
    ...base(m.today, w.start),
  };
}

/** Um insight por exercício estagnado (P8.4). */
export function exerciseStagnant(m: InsightMetrics): InsightCandidate[] {
  return m.stagnant.map((e) => ({
    type: 'EXERCISE_STAGNANT',
    category: 'training',
    severity: 'attention',
    key: e.exerciseId,
    title: `${e.name}: sem progresso`,
    body: `O e1RM de ${e.name} não supera ${fmt(e.bestE1rm, 1)} kg há pelo menos 4 exposições ou 21 dias. Sugestões: mudar a faixa de repetições ou trocar por uma variação do mesmo padrão.`,
    data: { exerciseId: e.exerciseId, bestE1rm: round(e.bestE1rm, 1) },
    ...base(m.today, addDays(m.today, -28)),
  }));
}

/** Queda de desempenho em 2 ou mais exercícios na mesma semana (P8.4). */
export function performanceDropRule(m: InsightMetrics): InsightCandidate | null {
  const byExercise = new Map(m.drops.map((d) => [d.exerciseId, d]));
  if (byExercise.size < 2) return null;
  const list = [...byExercise.values()];
  return {
    type: 'PERFORMANCE_DROP',
    category: 'training',
    severity: 'attention',
    key: 'main',
    title: 'Queda de desempenho na semana',
    body: `${list.length} exercícios tiveram e1RM pelo menos 5% abaixo da média das 3 sessões anteriores nos últimos 7 dias (${list.map((d) => d.name).join(', ')}). Vale olhar sono, alimentação e carga.`,
    data: {
      exercises: list.map((d) => ({
        exerciseId: d.exerciseId,
        name: d.name,
        date: d.date,
        e1rm: round(d.e1rm, 1),
        previousMean: round(d.previousMean, 1),
        dropPct: round((1 - d.e1rm / d.previousMean) * 100, 1),
      })),
    },
    ...base(m.today, addDays(m.today, -7)),
  };
}

/** ACWR acima de 1,5 hoje (P8.5). */
export function highAcwr(m: InsightMetrics): InsightCandidate | null {
  const last = m.load.at(-1);
  if (!last || last.acwr === null || last.acwr <= 1.5) return null;
  return {
    type: 'HIGH_ACWR',
    category: 'recovery',
    severity: 'warning',
    key: 'main',
    title: 'Pico de carga',
    body: `Sua carga dos últimos 7 dias está ${fmt(last.acwr, 2)} vezes a média das últimas semanas (acima de 1,5). Aumentos bruscos elevam o risco de lesão; considere segurar o volume nos próximos dias.`,
    data: {
      acwr: round(last.acwr, 2),
      acute7d: round(last.acute7d),
      chronic28d: round(last.chronic28d),
    },
    ...base(m.today, addDays(m.today, -7)),
  };
}

/** ACWR abaixo de 0,8 por 14 dias seguidos (P8.5). */
export function detraining(m: InsightMetrics): InsightCandidate | null {
  const last14 = m.load.slice(-14);
  if (last14.length < 14 || !last14.every((s) => s.acwr !== null && s.acwr < 0.8)) return null;
  const acwr = last14.at(-1)?.acwr ?? 0;
  return {
    type: 'DETRAINING',
    category: 'recovery',
    severity: 'info',
    key: 'main',
    title: 'Carga em queda há 2 semanas',
    body: `Sua carga semanal está abaixo de 80% da média das últimas semanas há 14 dias (ACWR ${fmt(acwr, 2)}). Se não for um descanso planejado, retomar aos poucos ajuda a manter o condicionamento.`,
    data: { acwr: round(acwr, 2), days: 14 },
    ...base(m.today, addDays(m.today, -13)),
  };
}

/** Monotonia (Foster) acima de 2,0 na semana (P8.5). */
export function highMonotony(m: InsightMetrics): InsightCandidate | null {
  const last = m.load.at(-1);
  if (!last || last.monotony7d === null || last.monotony7d <= 2) return null;
  return {
    type: 'HIGH_MONOTONY',
    category: 'recovery',
    severity: 'attention',
    key: 'main',
    title: 'Semana muito monótona',
    body: `A monotonia da carga nos últimos 7 dias está em ${fmt(last.monotony7d, 1)} (acima de 2,0): os dias tiveram carga muito parecida. Alternar dias leves e pesados ajuda a recuperação.`,
    data: { monotony: round(last.monotony7d, 2), strain: round(last.strain7d ?? 0) },
    ...base(m.today, addDays(m.today, -6)),
  };
}

const trendAt = (trend: readonly TrendPoint[], date: string) =>
  [...trend].reverse().find((p) => p.date <= date) ?? null;

/** Perda acima de 1% do peso por semana por 2 semanas seguidas (P5.7). */
export function weightLossTooFast(m: InsightMetrics): InsightCandidate | null {
  const t0 = trendAt(m.trend, m.today);
  const t7 = trendAt(m.trend, addDays(m.today, -7));
  const t14 = trendAt(m.trend, addDays(m.today, -14));
  if (!t0 || !t7 || !t14 || daysBetween(t0.date, m.today) > 3) return null;
  const span1 = daysBetween(t7.date, t0.date);
  const span2 = daysBetween(t14.date, t7.date);
  // Cada trecho precisa cobrir de 5 a 10 dias para valer como "semana".
  if (span1 < 5 || span2 < 5 || span1 > 10 || span2 > 10) return null;
  // Perda normalizada por semana pelo intervalo real entre as pesagens.
  const w1 = ((t7.trendKg - t0.trendKg) / t7.trendKg) * (7 / span1);
  const w2 = ((t14.trendKg - t7.trendKg) / t14.trendKg) * (7 / span2);
  if (w1 <= 0.01 || w2 <= 0.01) return null;
  return {
    type: 'WEIGHT_LOSS_TOO_FAST',
    category: 'body',
    severity: 'warning',
    key: 'main',
    title: 'Perda de peso rápida demais',
    body: `Sua tendência de peso caiu ${fmt(w2 * 100, 1)}% e ${fmt(w1 * 100, 1)}% nas duas últimas semanas, acima de 1% por semana. Considere reduzir o déficit para preservar massa magra.`,
    data: {
      lossPctWeek1: round(w2 * 100, 2),
      lossPctWeek2: round(w1 * 100, 2),
      trendKg: round(t0.trendKg, 2),
    },
    ...base(m.today, addDays(m.today, -14)),
  };
}

/**
 * Ritmo de peso fora do objetivo nos últimos 28 dias (P5.4): exige ≥ 21 dias de intervalo e
 * ≥ 8 pesagens. Perda de gordura: perdendo menos de 0,25%/semana; ganho: perdendo peso ou
 * ganhando mais de 1%/semana; manutenção e recomposição: |ritmo| > 0,5%/semana.
 */
export function weightTrendOffGoal(m: InsightMetrics): InsightCandidate | null {
  if (!m.goal || m.goal === 'performance') return null;
  const points = m.trend.filter((p) => p.date >= addDays(m.today, -28));
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last || points.length < 8) return null;
  const span = daysBetween(first.date, last.date);
  if (span < 21) return null;
  const rate = ((last.trendKg - first.trendKg) / first.trendKg) * 100 * (7 / span);
  let off = false;
  let expected = '';
  switch (m.goal) {
    case 'fat_loss':
      off = rate > -0.25;
      expected = 'perda de 0,5% a 1,0% por semana';
      break;
    case 'muscle_gain':
      off = rate < 0 || rate > 1;
      expected = 'ganho de 0,25% a 0,5% por semana';
      break;
    case 'maintenance':
    case 'recomposition':
      off = Math.abs(rate) > 0.5;
      expected = 'peso estável (±0,25% por semana)';
      break;
  }
  if (!off) return null;
  return {
    type: 'WEIGHT_TREND_OFF_GOAL',
    category: 'body',
    severity: 'attention',
    key: 'main',
    title: 'Ritmo de peso fora do objetivo',
    body: `Nas últimas ${Math.round(span / 7)} semanas sua tendência variou ${rate > 0 ? '+' : ''}${fmt(rate, 2)}% por semana; o esperado para o seu objetivo é ${expected}.`,
    data: {
      ratePctPerWeek: round(rate, 2),
      fromKg: round(first.trendKg, 2),
      toKg: round(last.trendKg, 2),
      days: span,
    },
    ...base(m.today, first.date),
  };
}

/** Aderência aos treinos (< 60% de 3+ agendados) e ao registro (< 7 dias completos em 14). */
export function lowConsistency(m: InsightMetrics): InsightCandidate[] {
  const out: InsightCandidate[] = [];
  const { planned, done } = m.workouts;
  if (planned >= 3 && done / planned < 0.6) {
    out.push({
      type: 'LOW_CONSISTENCY',
      category: 'training',
      severity: 'attention',
      key: 'workouts',
      title: 'Treinos agendados ficando para trás',
      body: `Você fez ${done} dos ${planned} treinos agendados nas últimas 2 semanas (${fmt((done / planned) * 100)}%). Se a agenda não cabe na rotina, ajuste os dias disponíveis.`,
      data: { planned, done, adherencePct: round((done / planned) * 100, 1) },
      ...base(m.today, addDays(m.today, -14)),
    });
  }
  const recent = m.nutritionDays.filter((d) => d.date >= addDays(m.today, -14));
  const logged = recent.filter((d) => d.loggedMeals > 0).length;
  const complete = recent.filter((d) => d.loggedMeals >= 3).length;
  if (logged > 0 && complete < 7) {
    out.push({
      type: 'LOW_CONSISTENCY',
      category: 'nutrition',
      severity: 'info',
      key: 'logging',
      title: 'Poucos dias com registro completo',
      body: `Só ${complete} dos últimos 14 dias tiveram 3 ou mais refeições registradas. Com mais dias completos, o gasto passa a ser estimado pelos seus dados.`,
      data: { completeDays: complete, loggedDays: logged, windowDays: 14 },
      ...base(m.today, addDays(m.today, -14)),
    });
  }
  return out;
}

/** Recordes de e1RM dos últimos 3 dias, um por exercício e dia. */
export function newPr(m: InsightMetrics): InsightCandidate[] {
  return m.records.map((r) => ({
    type: 'NEW_PR',
    category: 'training',
    severity: 'info',
    key: `${r.exerciseId}:${r.date}`,
    title: `Recorde em ${r.name}`,
    body: `Novo melhor e1RM em ${r.name}: ${fmt(r.e1rm, 1)} kg.`,
    data: { exerciseId: r.exerciseId, e1rm: round(r.e1rm, 1), date: r.date },
    periodStart: r.date,
    periodEnd: r.date,
    ttlDays: 3,
  }));
}

/** 7 dias ou mais sem pesagem. */
export function missedWeighIns(m: InsightMetrics): InsightCandidate | null {
  if (!m.lastWeighInDate) return null;
  const days = daysBetween(m.lastWeighInDate, m.today);
  if (days < 7) return null;
  return {
    type: 'MISSED_WEIGH_INS',
    category: 'body',
    severity: 'info',
    key: m.lastWeighInDate,
    title: 'Pesagens em atraso',
    body: `Sua última pesagem foi há ${days} dias. Pesagens frequentes deixam a tendência e as metas mais precisas.`,
    data: { lastWeighInDate: m.lastWeighInDate, daysAgo: days },
    ...base(m.today, m.lastWeighInDate),
  };
}

/** Ingestão < 90% da meta nos dias de treino pesado + queda de desempenho (P9). */
export function lowEnergyHardDays(m: InsightMetrics): InsightCandidate | null {
  if (!performanceDropRule(m)) return null;
  const hard = m.nutritionDays.filter(
    (d) =>
      d.date >= addDays(m.today, -14) &&
      d.dayType === 'hard_training' &&
      d.loggedMeals >= 3 &&
      d.targetKcal !== null,
  );
  if (hard.length < 2) return null;
  const pct =
    (hard.reduce((a, d) => a + d.kcal, 0) / hard.reduce((a, d) => a + (d.targetKcal ?? 0), 0)) *
    100;
  if (pct >= 90) return null;
  return {
    type: 'LOW_ENERGY_HARD_DAYS',
    category: 'integration',
    severity: 'warning',
    key: 'main',
    title: 'Energia insuficiente nos dias pesados',
    body: `Nos ${hard.length} dias de treino pesado das últimas 2 semanas você comeu em média ${fmt(pct)}% da meta de calorias, e o desempenho caiu nesta semana. Comer mais nesses dias pode ajudar.`,
    data: { hardDays: hard.length, intakePct: round(pct, 1) },
    ...base(m.today, addDays(m.today, -14)),
  };
}

/**
 * Deload antecipado (P8.7): queda de desempenho + prontidão média < 60 na semana (≥ 3 check-ins),
 * ou ACWR > 1,5 hoje e há 7 dias.
 */
export function earlyDeload(m: InsightMetrics): InsightCandidate | null {
  const avgReadiness = m.readinessWeek.length >= 3 ? mean(m.readinessWeek) : null;
  const byReadiness = performanceDropRule(m) !== null && avgReadiness !== null && avgReadiness < 60;
  const acwrNow = m.load.at(-1)?.acwr ?? null;
  const acwrWeekAgo = m.load.at(-8)?.acwr ?? null;
  const byLoad = acwrNow !== null && acwrWeekAgo !== null && acwrNow > 1.5 && acwrWeekAgo > 1.5;
  if (!byReadiness && !byLoad) return null;
  const reason = byReadiness
    ? `queda de desempenho com prontidão média de ${fmt(avgReadiness)} na semana`
    : 'carga acima de 1,5 vez a média por 2 semanas';
  return {
    type: 'EARLY_DELOAD',
    category: 'training',
    severity: 'attention',
    key: 'main',
    title: 'Considere uma semana de deload',
    body: `Sinais de fadiga acumulada: ${reason}. Uma semana com metade do volume e RIR 4 costuma ajudar a recuperar.`,
    data: {
      avgReadiness: avgReadiness === null ? null : round(avgReadiness, 1),
      acwr: acwrNow === null ? null : round(acwrNow, 2),
      reason: byReadiness ? 'performance_readiness' : 'acwr',
    },
    ...base(m.today, addDays(m.today, -14)),
  };
}

const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
};

/** Mínimos para uma correlação virar insight (P9). */
export const CORRELATION_RULES = { minPairs: 10, minAbsR: 0.4, minGroup: 3 } as const;

/**
 * Correlação de Pearson entre séries alinhadas (P9): n ≥ 10 e |r| ≥ 0,4, redigida como
 * associação. Quando os dois grupos (abaixo/acima do corte) têm ≥ 3 pares, o texto traz a
 * diferença média de y entre eles.
 */
export function correlationInsight(s: CorrelationSeries, today: string): InsightCandidate | null {
  const n = s.pairs.length;
  if (n < CORRELATION_RULES.minPairs) return null;
  const r = pearson(s.pairs);
  if (r === null || Math.abs(r) < CORRELATION_RULES.minAbsR) return null;
  const cut = s.type === 'SLEEP_PERFORMANCE_LINK' ? 6 : median(s.pairs.map(([x]) => x));
  const low = s.pairs.filter(([x]) => x < cut).map(([, y]) => y);
  const high = s.pairs.filter(([x]) => x >= cut).map(([, y]) => y);
  const mLow = mean(low);
  const mHigh = mean(high);
  const grouped =
    low.length >= CORRELATION_RULES.minGroup &&
    high.length >= CORRELATION_RULES.minGroup &&
    mLow !== null &&
    mHigh !== null &&
    mLow !== 0 &&
    mHigh !== 0;
  const tail = `(${n} dias analisados, r = ${fmt(r, 2)}). É uma associação, não prova de causa.`;
  let title: string;
  let body: string;
  let diff: number | null = null;
  switch (s.type) {
    case 'SLEEP_PERFORMANCE_LINK': {
      title = 'Sono e desempenho';
      if (grouped) {
        diff = (1 - mLow / mHigh) * 100;
        body = `Nas semanas analisadas, seus treinos após noites com menos de 6 h tiveram, em média, ${fmt(Math.abs(diff))}% ${diff >= 0 ? 'menos' : 'mais'} tonelagem que após noites mais longas ${tail}`;
      } else {
        body = `Nas semanas analisadas, noites ${r > 0 ? 'mais longas' : 'mais curtas'} coincidiram com treinos de maior tonelagem ${tail}`;
      }
      break;
    }
    case 'CARBS_TONNAGE_LINK': {
      title = 'Carboidrato e tonelagem';
      if (grouped) {
        diff = (mHigh / mLow - 1) * 100;
        body = `Nas semanas analisadas, treinos após dias com ${fmt(cut)} g de carboidrato ou mais tiveram, em média, ${fmt(Math.abs(diff))}% ${diff >= 0 ? 'mais' : 'menos'} tonelagem ${tail}`;
      } else {
        body = `Nas semanas analisadas, ${r > 0 ? 'mais' : 'menos'} carboidrato na véspera coincidiu com treinos de maior tonelagem ${tail}`;
      }
      break;
    }
    case 'KCAL_READINESS_LINK': {
      title = 'Calorias e prontidão';
      if (grouped) {
        diff = mHigh - mLow;
        body = `Nas semanas analisadas, nos dias após ingestão de ${fmt(cut)} kcal ou mais sua prontidão foi, em média, ${fmt(Math.abs(diff))} pontos ${diff >= 0 ? 'maior' : 'menor'} ${tail}`;
      } else {
        body = `Nas semanas analisadas, ${r > 0 ? 'mais' : 'menos'} calorias na véspera coincidiram com prontidão maior ${tail}`;
      }
      break;
    }
  }
  return {
    type: s.type,
    category: 'integration',
    severity: 'info',
    key: 'main',
    title,
    body,
    data: {
      r: round(r, 3),
      n,
      cut: round(cut, 1),
      lowMean: mLow === null ? null : round(mLow, 2),
      highMean: mHigh === null ? null : round(mHigh, 2),
      diff: diff === null ? null : round(diff, 1),
    },
    periodStart: addDays(today, -56),
    periodEnd: today,
    ttlDays: 7,
  };
}

/** Todas as regras (ADR-050), do mais severo para o menos. */
export function evaluateInsights(m: InsightMetrics): InsightCandidate[] {
  const all = [
    lowProteinStreak(m),
    muscleBelowMev(m),
    ...exerciseStagnant(m),
    performanceDropRule(m),
    highAcwr(m),
    detraining(m),
    highMonotony(m),
    weightLossTooFast(m),
    weightTrendOffGoal(m),
    ...lowConsistency(m),
    ...newPr(m),
    missedWeighIns(m),
    lowEnergyHardDays(m),
    earlyDeload(m),
    ...m.correlations.map((c) => correlationInsight(c, m.today)),
  ].filter((c): c is InsightCandidate => c !== null);
  return all.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}
