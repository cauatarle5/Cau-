import { describe, expect, it } from 'vitest';

import { katchMcArdle, mifflinStJeor, selectBmr } from './bmr';
import { energyAdjustment, goalEnergyPct } from './goals';
import { carbsAndFat, fatTarget, fiberTarget, proteinTarget, waterTarget } from './macros';
import { applySafetyLocks } from './safety';
import { computeTargets, type TargetsInput } from './targets';
import { activityMet, netExerciseKcal, plannedWeeklyExercise, sportMet, tdeeFormula } from './tdee';

describe('BMR (5.1)', () => {
  it('Mifflin-St Jeor for men and women', () => {
    // 10×80 + 6,25×180 − 5×30 + 5 = 1780
    expect(mifflinStJeor({ sex: 'male', weightKg: 80, heightCm: 180, ageYears: 30 })).toBe(1780);
    // 10×50 + 6,25×160 − 5×25 − 161 = 1214
    expect(mifflinStJeor({ sex: 'female', weightKg: 50, heightCm: 160, ageYears: 25 })).toBe(1214);
  });

  it('Katch-McArdle: 370 + 21,6 × lean mass', () => {
    expect(katchMcArdle(58.5)).toBeCloseTo(1633.6, 6);
  });

  it('uses Katch-McArdle only for measured body fat within 60 days', () => {
    const base = { sex: 'female' as const, weightKg: 90, heightCm: 165, ageYears: 40 };
    const measured = selectBmr({
      ...base,
      bodyFat: { pct: 35, method: 'bioimpedance', daysAgo: 10 },
    });
    expect(measured.method).toBe('katch_mcardle');
    expect(measured.kcal).toBeCloseTo(1633.6, 6);
    expect(measured.leanMassKg).toBeCloseTo(58.5, 6);

    const old = selectBmr({ ...base, bodyFat: { pct: 35, method: 'dexa', daysAgo: 61 } });
    const visual = selectBmr({ ...base, bodyFat: { pct: 35, method: 'visual', daysAgo: 1 } });
    for (const r of [old, visual]) expect(r.method).toBe('mifflin_st_jeor');
    // 900 + 1031,25 − 200 − 161 = 1570,25
    expect(old.kcal).toBeCloseTo(1570.25, 6);
  });
});

describe('TDEE (5.2)', () => {
  it('net exercise kcal = (MET − 1) × kg × h', () => {
    expect(netExerciseKcal(3.5, 80, 60)).toBe(200);
    expect(netExerciseKcal(10, 80, 90)).toBe(1080);
  });

  it('sport MET by intensity', () => {
    expect(sportMet('football', 3)).toBe(7);
    expect(sportMet('futsal', 4)).toBe(10);
    // Atividade registrada (ADR-048): RPE ≥ 7 = competitivo.
    expect(activityMet('football', 8)).toBe(10);
    expect(activityMet('football', 6)).toBe(7);
    expect(activityMet('running', 9)).toBe(8);
    expect(sportMet('running', 5)).toBe(8);
    expect(sportMet('cycling', 3)).toBe(6.8);
    expect(sportMet('swimming', 3)).toBe(5.8);
    expect(sportMet('other', 3)).toBe(3.5);
  });

  it('weekly planned exercise sums gym sessions and sports', () => {
    const plan = plannedWeeklyExercise(
      [60, 60, 60, 60],
      [{ sportCode: 'football', weeklyFrequency: 1, durationMin: 90, intensity: 4 }],
      80,
    );
    // Musculação: 2,5 × 80 × 4 h = 800; futebol: 9 × 80 × 1,5 h = 1080
    expect(plan.kcalPerWeek).toBe(1880);
    expect(plan.minutesPerWeek).toBe(330);
    expect(plan.items.map((i) => i.kind)).toEqual(['strength', 'football']);
  });

  it('TDEE = BMR × lifestyle + weekly exercise / 7', () => {
    const t = tdeeFormula(1780, 'moderate', 1880);
    expect(t.lifestyleKcal).toBe(2670);
    expect(t.kcal).toBeCloseTo(2938.5714, 3);
  });
});

describe('goal energy (5.4)', () => {
  it('percent by goal and experience', () => {
    expect(goalEnergyPct('fat_loss', 'beginner')).toBe(-0.2);
    expect(goalEnergyPct('maintenance', 'advanced')).toBe(0);
    expect(goalEnergyPct('muscle_gain', 'beginner')).toBe(0.1);
    expect(goalEnergyPct('muscle_gain', 'intermediate')).toBe(0.05);
    expect(goalEnergyPct('recomposition', 'beginner')).toBe(-0.05);
    expect(goalEnergyPct('performance', 'beginner')).toBe(0);
  });

  it('target rate overrides the goal percent: kg × rate × 7700 / 7', () => {
    const adj = energyAdjustment({
      goal: 'fat_loss',
      experience: 'beginner',
      tdeeKcal: 2800,
      weightKg: 80,
      targetRatePctPerWeek: -1,
    });
    expect(adj.source).toBe('rate');
    expect(adj.kcalDelta).toBeCloseTo(-880, 6);
  });
});

describe('safety locks (5.7)', () => {
  it('caps the deficit at 25% of TDEE', () => {
    expect(applySafetyLocks({ kcal: 1900, tdeeKcal: 2800, bmrKcal: 1700, sex: 'male' })).toEqual({
      kcal: 2100,
      applied: ['MAX_DEFICIT'],
    });
  });
  it('never goes below BMR', () => {
    expect(
      applySafetyLocks({ kcal: 1165, tdeeKcal: 1456.8, bmrKcal: 1214, sex: 'female' }),
    ).toEqual({
      kcal: 1214,
      applied: ['MIN_BMR'],
    });
  });
  it('never goes below 1500 (men) / 1200 (women)', () => {
    expect(applySafetyLocks({ kcal: 1300, tdeeKcal: 1600, bmrKcal: 1250, sex: 'male' }).kcal).toBe(
      1500,
    );
    expect(applySafetyLocks({ kcal: 1150, tdeeKcal: 1300, bmrKcal: 1100, sex: 'female' })).toEqual({
      kcal: 1200,
      applied: ['MIN_ABSOLUTE'],
    });
  });
  it('leaves safe values untouched', () => {
    expect(applySafetyLocks({ kcal: 2300, tdeeKcal: 2800, bmrKcal: 1700, sex: 'male' })).toEqual({
      kcal: 2300,
      applied: [],
    });
  });
});

describe('macros (5.6)', () => {
  it('protein: 1,8 default, 2,2 in deficit goals, 2,4 × lean mass with high body fat', () => {
    expect(proteinTarget({ goal: 'maintenance', sex: 'male', weightKg: 80 }).grams).toBeCloseTo(
      144,
      6,
    );
    expect(proteinTarget({ goal: 'fat_loss', sex: 'male', weightKg: 80 }).grams).toBeCloseTo(
      176,
      6,
    );
    expect(proteinTarget({ goal: 'recomposition', sex: 'female', weightKg: 60 }).grams).toBeCloseTo(
      132,
      6,
    );
    const lean = proteinTarget({ goal: 'fat_loss', sex: 'male', weightKg: 100, bodyFatPct: 30 });
    expect(lean.grams).toBeCloseTo(168, 6);
    expect(lean).toMatchObject({ gPerKg: 2.4, basis: 'lean_mass' });
    // Mulher com 30% (≤ 32%) usa peso total.
    expect(
      proteinTarget({ goal: 'maintenance', sex: 'female', weightKg: 60, bodyFatPct: 30 }).basis,
    ).toBe('total_weight');
    expect(
      proteinTarget({ goal: 'maintenance', sex: 'male', weightKg: 80, proteinGPerKgOverride: 2 })
        .grams,
    ).toBe(160);
  });

  it('fat: 0,8 g/kg with a 20% kcal floor', () => {
    expect(fatTarget(80, 2351)).toBe(64);
    // 20% de 4000 kcal / 9 = 88,9 g > 0,8 × 60
    expect(fatTarget(60, 4000)).toBeCloseTo(88.889, 3);
  });

  it('fiber: 14 g / 1000 kcal, minimum 25 g', () => {
    expect(fiberTarget(1500)).toBe(25);
    expect(fiberTarget(2500)).toBe(35);
  });

  it('water: 35 ml/kg + 500 ml per exercise hour', () => {
    expect(waterTarget(80, 1)).toBe(3300);
  });

  it('carbs are the remainder; with a floor, fat drops to 0,6 g/kg first', () => {
    expect(carbsAndFat({ kcal: 2351, proteinG: 176, fatG: 64, weightKg: 80 }).carbsG).toBeCloseTo(
      267.75,
      6,
    );
    // Piso 2 g/kg = 140 g: sem ajuste daria (1800 − 560 − 630)/4 = 152,5 → já acima do piso.
    expect(
      carbsAndFat({ kcal: 1800, proteinG: 140, fatG: 70, weightKg: 70, carbFloorGPerKg: 2 }),
    ).toEqual({
      carbsG: 152.5,
      fatG: 70,
    });
    // (1600 − 560 − 630)/4 = 102,5 < 140 → gordura cai para (1600 − 560 − 560)/9 = 53,3 (≥ 42 mínimo)
    const r = carbsAndFat({
      kcal: 1600,
      proteinG: 140,
      fatG: 70,
      weightKg: 70,
      carbFloorGPerKg: 2,
    });
    expect(r.carbsG).toBeCloseTo(140, 6);
    expect(r.fatG).toBeCloseTo(53.333, 3);
  });
});

describe('computeTargets (hand-checked cases)', () => {
  const man: TargetsInput = {
    sex: 'male',
    ageYears: 30,
    heightCm: 180,
    weightKg: 80,
    lifestyle: 'moderate',
    experience: 'beginner',
    goal: 'fat_loss',
    gymSessionMinutes: [60, 60, 60, 60],
    sports: [{ sportCode: 'football', weeklyFrequency: 1, durationMin: 90, intensity: 4 }],
  };

  it('fat loss, male, gym 4×60 + football 90 min', () => {
    // TMB 1780; GET 2670 + 1880/7 = 2938,57; −20% = 2350,86 → 2351
    // P 176; G max(64, 52,2) = 64; C (2351 − 704 − 576)/4 = 267,75 → 268
    // Fibra 32,9 → 33; água 2800 + 500 × 330/60/7 = 3192,9 → 3200
    const { targets, breakdown } = computeTargets(man);
    expect(targets).toEqual({
      kcal: 2351,
      proteinG: 176,
      fatG: 64,
      carbsG: 268,
      fiberG: 33,
      waterMl: 3200,
    });
    expect(breakdown.bmr.method).toBe('mifflin_st_jeor');
    expect(breakdown.tdee.kcal).toBeCloseTo(2938.571, 3);
    expect(breakdown.locksApplied).toEqual([]);
  });

  it('maintenance, female with measured high body fat → Katch-McArdle and lean-mass protein', () => {
    // Massa magra 58,5; TMB 1633,6; GET × 1,2 = 1960,32 → 1960
    // P 2,4 × 58,5 = 140,4 → 140; G max(72, 43,6) = 72; C (1960 − 560 − 648)/4 = 188
    const { targets, breakdown } = computeTargets({
      sex: 'female',
      ageYears: 40,
      heightCm: 165,
      weightKg: 90,
      bodyFat: { pct: 35, method: 'bioimpedance', daysAgo: 10 },
      lifestyle: 'sedentary',
      experience: 'beginner',
      goal: 'maintenance',
      gymSessionMinutes: [],
      sports: [],
    });
    expect(targets).toEqual({
      kcal: 1960,
      proteinG: 140,
      fatG: 72,
      carbsG: 188,
      fiberG: 27,
      waterMl: 3150,
    });
    expect(breakdown.bmr.method).toBe('katch_mcardle');
    expect(breakdown.protein.basis).toBe('lean_mass');
  });

  it('small woman in fat loss is held at BMR', () => {
    // TMB 1214; GET 1456,8; −20% = 1165,4 < TMB → 1214
    const { targets, breakdown } = computeTargets({
      sex: 'female',
      ageYears: 25,
      heightCm: 160,
      weightKg: 50,
      lifestyle: 'sedentary',
      experience: 'beginner',
      goal: 'fat_loss',
      gymSessionMinutes: [],
      sports: [],
    });
    expect(targets.kcal).toBe(1214);
    expect(breakdown.locksApplied).toEqual(['MIN_BMR']);
  });

  it('lean-mass protein needs a measured, recent body fat (same rule as BMR)', () => {
    const base = { ...man, goal: 'maintenance' as const, weightKg: 100 };
    const visual = computeTargets({ ...base, bodyFat: { pct: 30, method: 'visual', daysAgo: 1 } });
    expect(visual.breakdown.protein.basis).toBe('total_weight');
    const old = computeTargets({ ...base, bodyFat: { pct: 30, method: 'dexa', daysAgo: 400 } });
    expect(old.breakdown.protein.basis).toBe('total_weight');
    const fresh = computeTargets({ ...base, bodyFat: { pct: 30, method: 'dexa', daysAgo: 5 } });
    expect(fresh.breakdown.protein).toMatchObject({ basis: 'lean_mass', gPerKg: 2.4 });
    expect(fresh.targets.proteinG).toBe(168);
  });

  it('never rounds a locked value below the lock', () => {
    // 50,04 kg → TMB 1214,4; arredondar daria 1214 (< TMB). Com trava, arredonda para cima: 1215.
    const { targets, breakdown } = computeTargets({
      sex: 'female',
      ageYears: 25,
      heightCm: 160,
      weightKg: 50.04,
      lifestyle: 'sedentary',
      experience: 'beginner',
      goal: 'fat_loss',
      gymSessionMinutes: [],
      sports: [],
    });
    expect(breakdown.bmr.kcal).toBeCloseTo(1214.4, 6);
    expect(breakdown.locksApplied).toEqual(['MIN_BMR']);
    expect(targets.kcal).toBe(1215);
  });

  it('aggressive target rate is capped at 25% deficit', () => {
    // −1%/sem: −880 kcal → 2058,6; piso 0,75 × 2938,57 = 2203,9 → 2204
    const { targets, breakdown } = computeTargets({ ...man, targetRatePctPerWeek: -1 });
    expect(targets.kcal).toBe(2204);
    expect(breakdown.adjustment.source).toBe('rate');
    expect(breakdown.locksApplied).toEqual(['MAX_DEFICIT']);
  });
});
