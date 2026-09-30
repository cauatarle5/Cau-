import { describe, expect, it } from 'vitest';

import { bodyMeasurementInputSchema } from './body';
import { goalInputSchema, profileInputSchema } from './profile';

describe('bodyMeasurementInputSchema', () => {
  it('requires at least one value', () => {
    const r = bodyMeasurementInputSchema.safeParse({ date: '2026-09-30' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Informe ao menos uma medida');
  });

  it('requires a method when body fat is informed', () => {
    const r = bodyMeasurementInputSchema.safeParse({ date: '2026-09-30', bodyFatPct: 20 });
    expect(r.error?.issues[0]?.path).toEqual(['bodyFatMethod']);
  });

  it('enforces P3.6 ranges', () => {
    expect(bodyMeasurementInputSchema.safeParse({ date: '2026-09-30', weightKg: 24 }).success).toBe(
      false,
    );
    expect(
      bodyMeasurementInputSchema.safeParse({ date: '2026-09-30', weightKg: 350 }).success,
    ).toBe(true);
    expect(
      bodyMeasurementInputSchema.safeParse({
        date: '2026-09-30',
        bodyFatPct: 71,
        bodyFatMethod: 'dexa',
      }).success,
    ).toBe(false);
  });
});

describe('profileInputSchema', () => {
  const valid = {
    sex: 'male',
    birthDate: '1996-05-10',
    heightCm: 180,
    trainingExperience: 'beginner',
    conditioningLevel: 3,
    activityLifestyle: 'moderate',
  };
  it('applies defaults', () => {
    expect(profileInputSchema.parse(valid)).toMatchObject({
      aestheticPriorities: [],
      performancePriorities: [],
      clinicalCondition: false,
    });
  });
  it('rejects height out of range and future birth dates', () => {
    expect(profileInputSchema.safeParse({ ...valid, heightCm: 99 }).success).toBe(false);
    expect(profileInputSchema.safeParse({ ...valid, birthDate: '2999-01-01' }).success).toBe(false);
  });
});

describe('goalInputSchema', () => {
  it('limits the weekly rate to ±1.5%', () => {
    expect(
      goalInputSchema.safeParse({ primaryGoal: 'fat_loss', targetRatePctPerWeek: -2 }).success,
    ).toBe(false);
    expect(
      goalInputSchema.safeParse({ primaryGoal: 'fat_loss', targetRatePctPerWeek: -0.7 }).success,
    ).toBe(true);
  });
});
