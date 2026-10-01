import { describe, expect, it } from 'vitest';

import { addDays } from '../body/dates';
import type { LoadSnapshot } from '../recovery/load';

import {
  correlationInsight,
  detraining,
  earlyDeload,
  evaluateInsights,
  exerciseStagnant,
  highAcwr,
  highMonotony,
  lowConsistency,
  lowEnergyHardDays,
  lowProteinStreak,
  missedWeighIns,
  muscleBelowMev,
  newPr,
  performanceDropRule,
  weightLossTooFast,
  weightTrendOffGoal,
  type InsightMetrics,
  type NutritionDay,
} from './rules';
import { pearson } from './stats';

const TODAY = '2026-03-30'; // segunda-feira

function metrics(over: Partial<InsightMetrics> = {}): InsightMetrics {
  return {
    today: TODAY,
    goal: 'fat_loss',
    nutritionDays: [],
    lastWeek: null,
    stagnant: [],
    drops: [],
    load: [],
    trend: [],
    lastWeighInDate: null,
    workouts: { planned: 0, done: 0 },
    records: [],
    readinessWeek: [],
    correlations: [],
    ...over,
  };
}

const day = (offset: number, over: Partial<NutritionDay> = {}): NutritionDay => ({
  date: addDays(TODAY, offset),
  kcal: 2200,
  proteinG: 160,
  carbsG: 220,
  fatG: 70,
  loggedMeals: 3,
  dayType: 'training',
  trained: true,
  targetKcal: 2200,
  targetProteinG: 160,
  ...over,
});

const snap = (acwr: number | null, over: Partial<LoadSnapshot> = {}): LoadSnapshot => ({
  date: TODAY,
  dayAU: 0,
  acute7d: 0,
  chronic28d: 0,
  acwr,
  monotony7d: null,
  strain7d: null,
  ...over,
});

describe('pearson', () => {
  it('known values', () => {
    expect(
      pearson([
        [1, 2],
        [2, 4],
        [3, 6],
      ]),
    ).toBeCloseTo(1, 10);
    expect(
      pearson([
        [1, 3],
        [2, 2],
        [3, 1],
      ]),
    ).toBeCloseTo(-1, 10);
    // x = 1..5, y = 2,4,5,4,5: cov = 6, vx = 10, vy = 6 → r = 6 / √60 ≈ 0,7746.
    expect(
      pearson([
        [1, 2],
        [2, 4],
        [3, 5],
        [4, 4],
        [5, 5],
      ]),
    ).toBeCloseTo(0.7746, 4);
    expect(pearson([[1, 1]])).toBeNull();
    expect(
      pearson([
        [1, 1],
        [1, 2],
      ]),
    ).toBeNull();
  });
});

describe('insight rules (ADR-050)', () => {
  it('LOW_PROTEIN_STREAK: 3 of the last 5 training days below 80%', () => {
    const days = [
      day(-7, { proteinG: 100 }), // fora dos 5 últimos com treino
      day(-6),
      day(-5, { proteinG: 120 }), // 75%
      day(-4, { trained: false, proteinG: 50 }), // descanso não conta
      day(-3, { proteinG: 127 }), // 79,4%
      day(-2),
      day(-1, { proteinG: 96 }), // 60%
    ];
    const c = lowProteinStreak(metrics({ nutritionDays: days }));
    expect(c?.severity).toBe('attention');
    // (75 + 79,375 + 60) / 3 = 71,46%.
    expect(c?.data).toMatchObject({ days: 5, avgPct: 71.5 });
    expect(c?.body).toContain('Em 3 dos últimos 5 dias de treino');
    expect(lowProteinStreak(metrics({ nutritionDays: days.slice(1, 6) }))).toBeNull();
  });

  it('MUSCLE_BELOW_MEV: main muscles and priorities below 8 hard sets', () => {
    const lastWeek = {
      start: '2026-03-23',
      sessions: 3,
      muscles: [
        { muscle: 'chest' as const, hardSets: 12 },
        { muscle: 'lats' as const, hardSets: 10 },
        { muscle: 'upper_back' as const, hardSets: 9 },
        { muscle: 'side_delts' as const, hardSets: 8 },
        { muscle: 'quads' as const, hardSets: 10 },
        { muscle: 'hamstrings' as const, hardSets: 6 },
        { muscle: 'glutes' as const, hardSets: 8 },
        { muscle: 'biceps' as const, hardSets: 8 },
        { muscle: 'triceps' as const, hardSets: 8 },
        { muscle: 'calves' as const, hardSets: 2 },
      ],
      priorities: [],
    };
    const c = muscleBelowMev(metrics({ lastWeek }));
    expect(c?.data.muscles).toEqual([{ muscle: 'hamstrings', hardSets: 6 }]);
    // Panturrilha só alerta como prioridade.
    const prio = muscleBelowMev(metrics({ lastWeek: { ...lastWeek, priorities: ['calves'] } }));
    expect(prio?.data.muscles).toEqual([
      { muscle: 'calves', hardSets: 2 },
      { muscle: 'hamstrings', hardSets: 6 },
    ]);
    expect(muscleBelowMev(metrics({ lastWeek: { ...lastWeek, sessions: 1 } }))).toBeNull();
  });

  it('EXERCISE_STAGNANT: one per exercise', () => {
    const c = exerciseStagnant(
      metrics({ stagnant: [{ exerciseId: 'e1', name: 'Supino reto', bestE1rm: 100.333 }] }),
    );
    expect(c).toHaveLength(1);
    expect(c[0]?.key).toBe('e1');
    expect(c[0]?.body).toContain('100,3 kg');
  });

  it('PERFORMANCE_DROP needs 2 different exercises', () => {
    const drop = { exerciseId: 'a', name: 'Agachamento', date: TODAY, e1rm: 90, previousMean: 100 };
    expect(
      performanceDropRule(metrics({ drops: [drop, { ...drop, date: '2026-03-28' }] })),
    ).toBeNull();
    const c = performanceDropRule(
      metrics({
        drops: [drop, { ...drop, exerciseId: 'b', name: 'Supino', e1rm: 76, previousMean: 80 }],
      }),
    );
    expect(c?.data.exercises).toEqual([
      expect.objectContaining({ exerciseId: 'a', dropPct: 10 }),
      expect.objectContaining({ exerciseId: 'b', dropPct: 5 }),
    ]);
  });

  it('HIGH_ACWR > 1.5, DETRAINING < 0.8 for 14 days, HIGH_MONOTONY > 2', () => {
    expect(highAcwr(metrics({ load: [snap(1.5)] }))).toBeNull();
    expect(
      highAcwr(metrics({ load: [snap(1.62, { acute7d: 810, chronic28d: 500 })] }))?.body,
    ).toContain('1,62 vezes');
    const low = Array.from({ length: 14 }, () => snap(0.7));
    expect(detraining(metrics({ load: low }))?.severity).toBe('info');
    expect(detraining(metrics({ load: [...low.slice(1), snap(0.85)] }))).toBeNull();
    expect(detraining(metrics({ load: [...low.slice(1), snap(null)] }))).toBeNull();
    expect(highMonotony(metrics({ load: [snap(1, { monotony7d: 2 })] }))).toBeNull();
    expect(
      highMonotony(metrics({ load: [snap(1, { monotony7d: 2.4, strain7d: 4800 })] }))?.data,
    ).toEqual({
      monotony: 2.4,
      strain: 4800,
    });
  });

  it('WEIGHT_LOSS_TOO_FAST: > 1% per week for 2 weeks', () => {
    const pt = (offset: number, trendKg: number) => ({
      date: addDays(TODAY, offset),
      weightKg: trendKg,
      trendKg,
    });
    // 82 → 81 (1,22%) → 80 (1,23%), uma semana cada.
    const fast = [pt(-14, 82), pt(-7, 81), pt(0, 80)];
    expect(weightLossTooFast(metrics({ trend: fast }))?.data).toEqual({
      lossPctWeek1: 1.22,
      lossPctWeek2: 1.23,
      trendKg: 80,
    });
    // Segunda semana com 0,99%: não dispara.
    expect(
      weightLossTooFast(metrics({ trend: [pt(-14, 82), pt(-7, 81), pt(0, 80.2)] })),
    ).toBeNull();
    // Trecho de 6 dias é normalizado: 1 kg em 6 dias = 1,44%/semana.
    const six = weightLossTooFast(metrics({ trend: [pt(-14, 82), pt(-7, 81), pt(-1, 80)] }));
    expect(six?.data.lossPctWeek2).toBe(1.44);
    // Última pesagem antiga (> 3 dias).
    expect(
      weightLossTooFast(metrics({ trend: [pt(-21, 82), pt(-14, 81), pt(-5, 80)] })),
    ).toBeNull();
    // Lacuna de 14 dias entre pesagens não conta como uma semana.
    expect(
      weightLossTooFast(metrics({ trend: [pt(-21, 82), pt(-7, 81), pt(0, 79.9)] })),
    ).toBeNull();
  });

  it('WEIGHT_TREND_OFF_GOAL by goal over 28 days', () => {
    // 8 pesagens de 80 a 79,7 em 28 dias: −0,375% em 4 semanas = −0,094%/semana.
    const slow = Array.from({ length: 8 }, (_, i) => {
      const offset = -28 + i * 4;
      return {
        date: addDays(TODAY, offset),
        weightKg: 0,
        trendKg: 80 - (0.3 * (offset + 28)) / 28,
      };
    });
    const c = weightTrendOffGoal(metrics({ trend: slow }));
    expect(c?.data.ratePctPerWeek).toBe(-0.09);
    expect(weightTrendOffGoal(metrics({ trend: slow, goal: 'maintenance' }))).toBeNull();
    expect(weightTrendOffGoal(metrics({ trend: slow, goal: 'muscle_gain' }))).not.toBeNull();
    expect(weightTrendOffGoal(metrics({ trend: slow.slice(1) }))).toBeNull(); // 7 pesagens
  });

  it('LOW_CONSISTENCY for workouts and logging', () => {
    const w = lowConsistency(metrics({ workouts: { planned: 8, done: 4 } }));
    expect(w).toHaveLength(1);
    expect(w[0]?.data).toEqual({ planned: 8, done: 4, adherencePct: 50 });
    expect(lowConsistency(metrics({ workouts: { planned: 5, done: 3 } }))).toHaveLength(0);
    const days = Array.from({ length: 14 }, (_, i) => day(-14 + i, { loggedMeals: i < 6 ? 3 : 1 }));
    const l = lowConsistency(metrics({ nutritionDays: days }));
    expect(l[0]?.data).toEqual({ completeDays: 6, loggedDays: 14, windowDays: 14 });
  });

  it('NEW_PR and MISSED_WEIGH_INS', () => {
    const pr = newPr(
      metrics({ records: [{ exerciseId: 'e', name: 'Terra', date: TODAY, e1rm: 180 }] }),
    );
    expect(pr[0]).toMatchObject({ key: `e:${TODAY}`, ttlDays: 3 });
    expect(missedWeighIns(metrics({ lastWeighInDate: addDays(TODAY, -6) }))).toBeNull();
    expect(missedWeighIns(metrics({ lastWeighInDate: addDays(TODAY, -9) }))?.data).toEqual({
      lastWeighInDate: '2026-03-21',
      daysAgo: 9,
    });
  });

  it('LOW_ENERGY_HARD_DAYS and EARLY_DELOAD depend on a performance drop', () => {
    const drops = [
      { exerciseId: 'a', name: 'A', date: TODAY, e1rm: 90, previousMean: 100 },
      { exerciseId: 'b', name: 'B', date: TODAY, e1rm: 90, previousMean: 100 },
    ];
    const hard = [
      day(-5, { dayType: 'hard_training', kcal: 2000, targetKcal: 2500 }),
      day(-2, { dayType: 'hard_training', kcal: 2100, targetKcal: 2500 }),
    ];
    // 4100 / 5000 = 82%.
    expect(lowEnergyHardDays(metrics({ nutritionDays: hard, drops }))?.data).toEqual({
      hardDays: 2,
      intakePct: 82,
    });
    expect(lowEnergyHardDays(metrics({ nutritionDays: hard }))).toBeNull();
    expect(earlyDeload(metrics({ drops, readinessWeek: [55, 58, 62] }))?.data.reason).toBe(
      'performance_readiness',
    );
    expect(earlyDeload(metrics({ drops, readinessWeek: [55, 70, 62] }))).toBeNull();
    const load = [snap(1.6), ...Array.from({ length: 6 }, () => snap(1.2)), snap(1.55)];
    expect(earlyDeload(metrics({ load }))?.data.reason).toBe('acwr');
  });

  it('correlations: n ≥ 10, |r| ≥ 0.4, worded as association', () => {
    // Noites curtas (5 h) com tonelagem relativa 90; longas (7–8 h) com 100–104.
    const pairs: [number, number][] = [
      [5, 90],
      [5.5, 91],
      [5, 89],
      [7, 100],
      [7.5, 102],
      [8, 104],
      [7, 101],
      [8, 103],
      [7.5, 100],
      [6.5, 99],
    ];
    const c = correlationInsight({ type: 'SLEEP_PERFORMANCE_LINK', pairs }, TODAY);
    expect(c).not.toBeNull();
    // Média curta = 90, longa = 101,29 → 1 − 90/101,29 = 11,1%.
    expect(c?.data.diff).toBe(11.1);
    expect(c?.body).toContain('noites com menos de 6 h tiveram, em média, 11% menos tonelagem');
    expect(c?.body).toContain('associação, não prova de causa');
    expect(
      correlationInsight({ type: 'SLEEP_PERFORMANCE_LINK', pairs: pairs.slice(1) }, TODAY),
    ).toBeNull();
    const noise: [number, number][] = pairs.map(([x], i) => [x, i % 2 ? 100 : 95]);
    expect(correlationInsight({ type: 'KCAL_READINESS_LINK', pairs: noise }, TODAY)).toBeNull();
  });

  it('evaluateInsights sorts by severity', () => {
    const all = evaluateInsights(
      metrics({
        load: [snap(1.7)],
        lastWeighInDate: addDays(TODAY, -10),
        stagnant: [{ exerciseId: 'e', name: 'Remada', bestE1rm: 80 }],
      }),
    );
    expect(all.map((c) => c.type)).toEqual(['HIGH_ACWR', 'EXERCISE_STAGNANT', 'MISSED_WEIGH_INS']);
  });
});
