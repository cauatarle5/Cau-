import { describe, expect, it } from 'vitest';

import { addDays } from '../body/dates';

import { adaptiveTdee, type AdaptiveDay } from './adaptive';
import { computeTargets } from './targets';

const START = '2026-03-02';

function days(complete: number, kcal = 2200, incomplete = 0): AdaptiveDay[] {
  return [
    ...Array.from({ length: complete }, (_, i) => ({
      date: addDays(START, i),
      kcal,
      loggedMeals: 3,
    })),
    // Dias incompletos (< 3 refeições) não entram na média.
    ...Array.from({ length: incomplete }, (_, i) => ({
      date: addDays(START, complete + i),
      kcal: 900,
      loggedMeals: 2,
    })),
  ];
}

/** `n` pontos de tendência entre o dia 0 e `span`, caindo linearmente `drop` kg. */
function trend(n: number, span: number, drop: number) {
  return Array.from({ length: n }, (_, i) => {
    const offset = i === n - 1 ? span : Math.round((i * span) / (n - 1));
    return { date: addDays(START, offset), weightKg: 0, trendKg: 80 - (drop * offset) / span };
  });
}

describe('adaptiveTdee (P5.3, ADR-051)', () => {
  it('medium confidence: 0.7 × observed + 0.3 × previous', () => {
    // obs = 2200 − (−0,7 × 7700) / 14 = 2585; usado = 0,7 × 2585 + 0,3 × 2400 = 2529,5.
    const e = adaptiveTdee({
      days: days(14, 2200, 4),
      trend: trend(10, 14, 0.7),
      tdeeFormula: 2350,
      previousTdee: 2400,
    });
    expect(e).toEqual({
      tdeeFormula: 2350,
      tdeeObserved: 2585,
      tdeeUsed: 2530,
      confidence: 'medium',
      weightTrendKg: -0.7,
      intakeAvgKcal: 2200,
      loggedDays: 14,
      weighInCount: 10,
    });
  });

  it('caps the change at ±150 kcal of the previous TDEE', () => {
    // 0,7 × 2585 + 0,3 × 2300 = 2499,5 → limitado a 2300 + 150.
    const up = adaptiveTdee({
      days: days(14),
      trend: trend(10, 14, 0.7),
      tdeeFormula: 2350,
      previousTdee: 2300,
    });
    expect(up.tdeeUsed).toBe(2450);
    // Ganho de 1,4 kg em 14 dias: obs = 2200 − 770 = 1430 → 0,7 × 1430 + 0,3 × 2400 = 1721 → 2250.
    const down = adaptiveTdee({
      days: days(14),
      trend: trend(10, 14, -1.4),
      tdeeFormula: 2350,
      previousTdee: 2400,
    });
    expect(down.tdeeObserved).toBe(1430);
    expect(down.tdeeUsed).toBe(2250);
  });

  it('high confidence (≥ 21 days, ≥ 18 weigh-ins): 0.85 / 0.15; formula as prior', () => {
    // obs = 2200 + 1,05 × 7700 / 21 = 2585; 0,85 × 2585 + 0,15 × 2500 = 2572,25.
    const e = adaptiveTdee({
      days: days(21),
      trend: trend(18, 21, 1.05),
      tdeeFormula: 2500,
      previousTdee: null,
    });
    expect(e.confidence).toBe('high');
    expect(e.tdeeObserved).toBe(2585);
    expect(e.tdeeUsed).toBe(2572);
  });

  it('below the criteria: low confidence and the formula TDEE', () => {
    const fewDays = adaptiveTdee({
      days: days(13, 2200, 10),
      trend: trend(12, 20, 0.5),
      tdeeFormula: 2350.4,
      previousTdee: 2600,
    });
    expect(fewDays.confidence).toBe('low');
    expect(fewDays.tdeeUsed).toBe(2350);
    expect(fewDays.loggedDays).toBe(13);
    const fewWeighIns = adaptiveTdee({
      days: days(20),
      trend: trend(9, 20, 0.5),
      tdeeFormula: 2350,
      previousTdee: null,
    });
    expect(fewWeighIns.confidence).toBe('low');
    const noData = adaptiveTdee({ days: [], trend: [], tdeeFormula: 2000, previousTdee: null });
    expect(noData).toMatchObject({
      confidence: 'low',
      tdeeObserved: null,
      intakeAvgKcal: null,
      weightTrendKg: null,
      tdeeUsed: 2000,
    });
  });
});

describe('computeTargets with adaptive TDEE', () => {
  const input = {
    sex: 'male' as const,
    ageYears: 30,
    heightCm: 180,
    weightKg: 80,
    lifestyle: 'light' as const,
    experience: 'intermediate' as const,
    goal: 'maintenance' as const,
    gymSessionMinutes: [60, 60, 60],
    sports: [],
  };

  it('replaces the formula TDEE and keeps it in the breakdown', () => {
    const formula = computeTargets(input);
    const adaptive = computeTargets({ ...input, adaptiveTdee: { kcal: 2900, confidence: 'high' } });
    expect(formula.breakdown.adaptive).toBeNull();
    expect(adaptive.breakdown.tdee.kcal).toBe(2900);
    expect(adaptive.breakdown.adaptive).toEqual({
      kcal: 2900,
      confidence: 'high',
      formulaKcal: formula.breakdown.tdee.kcal,
    });
    // Manutenção: meta = GET.
    expect(adaptive.targets.kcal).toBe(2900);
  });

  it('safety locks still apply (P5.7)', () => {
    // GET observado muito baixo nunca leva a meta abaixo da TMB.
    const r = computeTargets({ ...input, adaptiveTdee: { kcal: 1300, confidence: 'medium' } });
    expect(r.targets.kcal).toBeGreaterThanOrEqual(Math.ceil(r.breakdown.bmr.kcal));
    expect(r.breakdown.locksApplied).toContain('MIN_BMR');
  });
});
