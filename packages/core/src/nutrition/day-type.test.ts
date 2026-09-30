import { describe, expect, it } from 'vitest';

import {
  distributeWeek,
  planDayType,
  plannedRemaining,
  rawDayKcal,
  remainingTargets,
  type WeekDayPlan,
} from './day-type';

const base = { kcal: 2400, proteinG: 160, fatG: 70, carbsG: 282, fiberG: 34, waterMl: 2800 };
const day = (
  date: string,
  dayType: WeekDayPlan['dayType'],
  sportKcal = 0,
  exerciseMinutes = 0,
): WeekDayPlan => ({
  date,
  dayType,
  sportKcal,
  exerciseMinutes,
});

describe('planDayType (ADR-026)', () => {
  it('derives the type from the weekly plan', () => {
    expect(planDayType({ gym: false, sport: false })).toBe('rest');
    expect(planDayType({ gym: true, sport: false })).toBe('training');
    expect(planDayType({ gym: true, sport: false, hardGym: true })).toBe('hard_training');
    expect(planDayType({ gym: false, sport: true })).toBe('sport');
    expect(planDayType({ gym: true, sport: true })).toBe('sport_and_training');
  });
});

describe('rawDayKcal (P5.8)', () => {
  it('rest −10%, training base, hard +5%, sport base + sport kcal capped at +25%', () => {
    expect(rawDayKcal(2400, day('d', 'rest'))).toBe(2160);
    expect(rawDayKcal(2400, day('d', 'training'))).toBe(2400);
    expect(rawDayKcal(2400, day('d', 'hard_training'))).toBe(2520);
    expect(rawDayKcal(2400, day('d', 'sport', 400))).toBe(2800);
    expect(rawDayKcal(2400, day('d', 'sport', 900))).toBe(3000);
  });
});

describe('distributeWeek (P5.8)', () => {
  const week = [
    day('2026-09-28', 'training', 0, 60),
    day('2026-09-29', 'rest'),
    day('2026-09-30', 'training', 0, 60),
    day('2026-10-01', 'rest'),
    day('2026-10-02', 'training', 0, 60),
    day('2026-10-03', 'sport', 540, 90),
    day('2026-10-04', 'rest'),
  ];

  it('preserves the weekly average, keeps protein fixed and moves carbs', () => {
    const out = distributeWeek({ base, week, weightKg: 80, bmrKcal: 1780, sex: 'male' });
    // Brutos: 3×2400 + 3×2160 + 2940 = 16620; alvo 16800 → +25,7/dia
    expect(out.map((d) => d.kcal)).toEqual([2426, 2186, 2426, 2186, 2426, 2966, 2186]);
    const avg = out.reduce((a, d) => a + d.kcal, 0) / 7;
    expect(avg).toBeCloseTo(2400, 0);
    expect(new Set(out.map((d) => d.proteinG))).toEqual(new Set([160]));
    expect(new Set(out.map((d) => d.fatG))).toEqual(new Set([70]));
    // Carbo do descanso: (2186 − 640 − 630)/4 = 229
    expect(out[1]?.carbsG).toBe(229);
    // Água: 2800 + 500 × 1,5 h = 3550
    expect(out[5]?.waterMl).toBe(3550);
  });

  it('never goes below the safety floor', () => {
    const low = { ...base, kcal: 1550 };
    const out = distributeWeek({
      base: low,
      week: week.map((d) => ({ ...d, dayType: 'rest' as const })),
      weightKg: 60,
      bmrKcal: 1500,
      sex: 'male',
    });
    expect(Math.min(...out.map((d) => d.kcal))).toBeGreaterThanOrEqual(1500);
  });

  it('keeps 2 g/kg carbs on sport days by lowering fat to 0.6 g/kg first', () => {
    const tight = { kcal: 1800, proteinG: 180, fatG: 70, carbsG: 112, fiberG: 25, waterMl: 2800 };
    const [sport] = distributeWeek({
      base: tight,
      week: [day('d', 'sport', 0, 60)],
      weightKg: 80,
      bmrKcal: 1700,
      sex: 'male',
    });
    // Sem ajuste: (1800 − 720 − 630)/4 = 112,5 < 160 → gordura (1800 − 720 − 640)/9 = 48,9 (≥ 48)
    expect(sport?.fatG).toBe(49);
    expect(sport?.carbsG).toBe(160);
  });
});

describe('floor vs weekly average (ADR-028)', () => {
  it('the safety floor wins even if the weekly total ends above 7 × base', () => {
    const low = { kcal: 1600, proteinG: 150, fatG: 55, carbsG: 128, fiberG: 25, waterMl: 2500 };
    const week = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((d, i) =>
      day(d, i < 3 ? 'rest' : 'training'),
    );
    const out = distributeWeek({ base: low, week, weightKg: 70, bmrKcal: 1550, sex: 'male' });
    expect(Math.min(...out.map((d) => d.kcal))).toBeGreaterThanOrEqual(1550);
    expect(out.reduce((a, d) => a + d.kcal, 0)).toBeGreaterThanOrEqual(7 * 1600);
  });
});

describe('remainingTargets', () => {
  it('subtracts consumed from targets (negative = over)', () => {
    const t = { kcal: 2000, proteinG: 150, carbsG: 200, fatG: 60, fiberG: 28, waterMl: 3000 };
    const c = { kcal: 2100, proteinG: 100, carbsG: 250, fatG: 50, fiberG: 10, waterMl: 500 };
    expect(remainingTargets(t, c)).toEqual({
      kcal: -100,
      proteinG: 50,
      carbsG: -50,
      fatG: 10,
      fiberG: 18,
      waterMl: 2500,
    });
  });
});

describe('plannedRemaining', () => {
  it('target − consumed − planned, floored at zero', () => {
    const t = { kcal: 2000, proteinG: 150, carbsG: 200, fatG: 60, fiberG: 28, waterMl: 3000 };
    const c = { kcal: 800, proteinG: 60, carbsG: 90, fatG: 30, fiberG: 10, waterMl: 500 };
    const p = { kcal: 700, proteinG: 50, carbsG: 120, fatG: 20, fiberG: 5, waterMl: 0 };
    expect(plannedRemaining(t, c, p)).toEqual({
      kcal: 500,
      proteinG: 40,
      carbsG: 0,
      fatG: 10,
      fiberG: 13,
      waterMl: 2500,
    });
  });
});
