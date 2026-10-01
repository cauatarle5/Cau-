import { describe, expect, it } from 'vitest';

import { contextFlags } from '../context/flags';

import { logCompleteness, perWeek, relativePerformance, strengthTrend } from './performance';
import { comparePeriods, periodSummary, type PeriodInput } from './summary';

const input: PeriodInput = {
  from: '2026-03-02',
  to: '2026-03-29',
  sessions: [
    { date: '2026-03-03', tonnage: 10000, hardSets: 18, rpe: 7 },
    { date: '2026-03-05', tonnage: 12000.4, hardSets: 20, rpe: 8 },
    { date: '2026-03-10', tonnage: 11000, hardSets: 19, rpe: null },
  ],
  workouts: { planned: 4, done: 3 },
  nutritionDays: [
    {
      date: '2026-03-03',
      dayType: 'training',
      kcal: 2200,
      proteinG: 150,
      carbsG: 250,
      fatG: 70,
      loggedMeals: 4,
      targetKcal: 2300,
      targetProteinG: 160,
    },
    {
      date: '2026-03-04',
      dayType: 'rest',
      kcal: 2000,
      proteinG: 130,
      carbsG: 200,
      fatG: 70,
      loggedMeals: 3,
      targetKcal: 2050,
      targetProteinG: 160,
    },
    {
      date: '2026-03-05',
      dayType: 'training',
      kcal: 2600,
      proteinG: 170,
      carbsG: 300,
      fatG: 80,
      loggedMeals: 3,
      targetKcal: 2300,
      targetProteinG: 160,
    },
    // Incompleto: conta como registrado, não entra nas médias.
    {
      date: '2026-03-06',
      dayType: 'rest',
      kcal: 800,
      proteinG: 40,
      carbsG: 90,
      fatG: 30,
      loggedMeals: 1,
      targetKcal: 2050,
      targetProteinG: 160,
    },
  ],
  trend: [
    { date: '2026-03-02', weightKg: 80, trendKg: 80 },
    { date: '2026-03-16', weightKg: 79.5, trendKg: 79.6 },
    { date: '2026-03-23', weightKg: 79, trendKg: 79.2 },
  ],
  checkins: [
    { date: '2026-03-03', sleepHours: 7, readiness: 80 },
    { date: '2026-03-04', sleepHours: 6, readiness: 65 },
    { date: '2026-03-05', sleepHours: null, readiness: null },
  ],
  load: [
    {
      date: '2026-03-28',
      dayAU: 0,
      acute7d: 1000,
      chronic28d: 900,
      acwr: 1.111,
      monotony7d: null,
      strain7d: null,
    },
    {
      date: '2026-03-29',
      dayAU: 0,
      acute7d: 800,
      chronic28d: 900,
      acwr: 0.889,
      monotony7d: null,
      strain7d: null,
    },
  ],
};

describe('periodSummary (P12.6)', () => {
  it('computes training, nutrition, body and recovery numbers', () => {
    const s = periodSummary(input);
    expect(s.days).toBe(28);
    expect(s.training).toEqual({
      sessions: 3,
      sessionsPerWeek: 0.8,
      tonnage: 33000,
      hardSets: 57,
      avgRpe: 7.5,
      planned: 4,
      done: 3,
      adherencePct: 75,
    });
    expect(s.nutrition).toMatchObject({
      loggedDays: 4,
      completeDays: 3,
      avgKcal: 2267,
      avgProteinG: 150,
      // 150 ≥ 144 e 170 ≥ 144 → 2 de 3.
      proteinAdherencePct: 66.7,
      // 2200/2300 e 2000/2050 dentro de ±10%; 2600/2300 = 113% fora.
      kcalAdherencePct: 66.7,
    });
    expect(s.nutrition.byDayType).toEqual([
      {
        dayType: 'rest',
        days: 1,
        kcal: 2000,
        proteinG: 130,
        carbsG: 200,
        fatG: 70,
        targetKcal: 2050,
      },
      {
        dayType: 'training',
        days: 2,
        kcal: 2400,
        proteinG: 160,
        carbsG: 275,
        fatG: 75,
        targetKcal: 2300,
      },
    ]);
    // −0,8 kg em 21 dias: −1% × 7/21 = −0,33%/semana.
    expect(s.body).toEqual({
      startTrendKg: 80,
      endTrendKg: 79.2,
      changeKg: -0.8,
      ratePctPerWeek: -0.33,
      weighIns: 3,
    });
    expect(s.recovery).toEqual({
      avgSleepHours: 6.5,
      avgReadiness: 73,
      checkins: 3,
      avgAcute7d: 900,
      lastAcwr: 0.89,
    });
  });

  it('empty period has nulls, not zeros', () => {
    const s = periodSummary({
      ...input,
      sessions: [],
      nutritionDays: [],
      trend: [],
      checkins: [],
      load: [],
      workouts: { planned: 0, done: 0 },
    });
    expect(s.training.adherencePct).toBeNull();
    expect(s.nutrition.avgKcal).toBeNull();
    expect(s.body.changeKg).toBeNull();
    expect(s.recovery.avgReadiness).toBeNull();
  });

  it('comparePeriods: B relative to A', () => {
    const a = periodSummary(input);
    const b = periodSummary({ ...input, workouts: { planned: 4, done: 4 } });
    const adherence = comparePeriods(a, b).find((d) => d.metric === 'training.adherencePct');
    expect(adherence).toEqual({
      metric: 'training.adherencePct',
      a: 75,
      b: 100,
      delta: 25,
      deltaPct: 33.3,
    });
    const empty = periodSummary({ ...input, trend: [] });
    const change = comparePeriods(empty, a).find((d) => d.metric === 'body.changeKg');
    expect(change).toEqual({
      metric: 'body.changeKg',
      a: null,
      b: -0.8,
      delta: null,
      deltaPct: null,
    });
  });
});

describe('contextFlags (P9)', () => {
  const base = {
    proteinProjectedG: 150,
    proteinTargetG: 160,
    hasMeals: true,
    sportYesterday: false,
    sleepHours: 8,
    sleepQuality: 4,
    acwr: 1.1,
  };
  it('no flags on a normal day', () => {
    expect(contextFlags(base)).toEqual([]);
  });
  it('each flag by its threshold', () => {
    expect(contextFlags({ ...base, proteinProjectedG: 127 })).toEqual(['LOW_PROTEIN_TODAY']);
    expect(contextFlags({ ...base, proteinProjectedG: 0, hasMeals: false })).toEqual([]);
    expect(contextFlags({ ...base, sportYesterday: true })).toEqual(['SPORT_YESTERDAY']);
    expect(contextFlags({ ...base, sleepHours: 5.5 })).toEqual(['POOR_SLEEP']);
    expect(contextFlags({ ...base, sleepQuality: 2 })).toEqual(['POOR_SLEEP']);
    expect(contextFlags({ ...base, acwr: 1.51 })).toEqual(['HIGH_ACWR']);
  });
});

describe('performance helpers', () => {
  it('relativePerformance: tonnage vs the mean of sessions with the same name', () => {
    const r = relativePerformance([
      { date: 'd1', name: 'A', tonnage: 9000 },
      { date: 'd2', name: 'A', tonnage: 11000 },
      { date: 'd3', name: 'B', tonnage: 5000 },
    ]);
    expect(r.map((x) => x.date)).toEqual(['d1', 'd2']);
    expect(r[0]?.index).toBeCloseTo(90, 10);
    expect(r[1]?.index).toBeCloseTo(110, 10);
  });

  it('strengthTrend: first/last/best, change and drops', () => {
    const all = [
      { date: '2026-03-01', e1rm: 100 },
      { date: '2026-03-08', e1rm: 102 },
      { date: '2026-03-15', e1rm: 104 },
      { date: '2026-03-22', e1rm: 106 },
      // Média das 3 anteriores = 104; 98 ≤ 98,8 → queda.
      { date: '2026-03-29', e1rm: 98 },
    ];
    const t = strengthTrend(all, '2026-03-08', '2026-03-23');
    expect(t).toMatchObject({ first: 102, last: 98, best: 106, sessions: 4 });
    expect(t?.changePct).toBeCloseTo(-3.92, 2);
    expect(t?.drops).toEqual([{ date: '2026-03-29', e1rm: 98, previousMean: 104 }]);
    expect(strengthTrend(all, '2026-04-01', '2026-04-01')).toBeNull();
  });

  it('perWeek and logCompleteness', () => {
    expect(perWeek(30, 28)).toBe(7.5);
    expect(perWeek(5, 3)).toBe(5);
    expect(logCompleteness(2)).toBeCloseTo(2 / 3, 10);
    expect(logCompleteness(5)).toBe(1);
  });
});
