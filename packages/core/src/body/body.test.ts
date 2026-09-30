import { describe, expect, it } from 'vitest';

import { ageOn, daysBetween } from './age';
import { dailyWeights, isUnusualWeightChange, latestTrend, weightTrend } from './weight-trend';

describe('ageOn', () => {
  it.each([
    ['1996-05-10', '2026-05-09', 29],
    ['1996-05-10', '2026-05-10', 30],
    ['1996-05-10', '2026-12-31', 30],
    ['2000-02-29', '2026-02-28', 25],
  ])('ageOn(%s, %s) = %d', (birth, on, expected) => {
    expect(ageOn(birth, on)).toBe(expected);
  });

  it('rejects malformed dates', () => {
    expect(() => ageOn('1996/05/10', '2026-01-01')).toThrow(RangeError);
  });
});

describe('daysBetween', () => {
  it('counts whole days across months', () => {
    expect(daysBetween('2026-01-30', '2026-02-02')).toBe(3);
  });
});

describe('dailyWeights', () => {
  it('averages same-day weigh-ins and sorts by date', () => {
    expect(
      dailyWeights([
        { date: '2026-01-02', weightKg: 80 },
        { date: '2026-01-01', weightKg: 81 },
        { date: '2026-01-02', weightKg: 81 },
      ]),
    ).toEqual([
      { date: '2026-01-01', weightKg: 81 },
      { date: '2026-01-02', weightKg: 80.5 },
    ]);
  });
});

describe('weightTrend', () => {
  it('starts at the first weight and applies EMA with alpha 0.1', () => {
    const points = weightTrend([
      { date: '2026-01-01', weightKg: 80 },
      { date: '2026-01-02', weightKg: 81 },
      { date: '2026-01-05', weightKg: 79 },
    ]);
    // 80 → 80 + 0,1×(81−80) = 80,1 → 80,1 + 0,1×(79−80,1) = 79,99
    expect(points.map((p) => p.trendKg)).toEqual([
      80,
      expect.closeTo(80.1, 10),
      expect.closeTo(79.99, 10),
    ]);
    // Dias sem pesagem não geram pontos (sem interpolação).
    expect(points.map((p) => p.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-05']);
  });

  it('returns empty for no data and latestTrend null', () => {
    expect(weightTrend([])).toEqual([]);
    expect(latestTrend([])).toBeNull();
  });
});

describe('isUnusualWeightChange', () => {
  const prev = { date: '2026-01-01', weightKg: 80, trendKg: 80 };
  it('flags more than 2% of trend per elapsed day', () => {
    expect(isUnusualWeightChange(prev, { date: '2026-01-02', weightKg: 81.7 })).toBe(true); // 2,125%
    expect(isUnusualWeightChange(prev, { date: '2026-01-02', weightKg: 81.5 })).toBe(false); // 1,875%
    expect(isUnusualWeightChange(prev, { date: '2026-01-04', weightKg: 84 })).toBe(false); // 5% / 3 dias
  });
  it('treats same-day entries as one day', () => {
    expect(isUnusualWeightChange(prev, { date: '2026-01-01', weightKg: 78 })).toBe(true); // 2,5%
  });
});

describe('dates', () => {
  it('localDate uses the user time zone', async () => {
    const { localDate } = await import('./dates');
    // 02:30 UTC ainda é o dia anterior em São Paulo (UTC−3).
    const instant = new Date('2026-09-30T02:30:00Z');
    expect(localDate(instant, 'America/Sao_Paulo')).toBe('2026-09-29');
    expect(localDate(instant, 'UTC')).toBe('2026-09-30');
  });

  it('addDays and dateRange cross month boundaries', async () => {
    const { addDays, dateRange } = await import('./dates');
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
    expect(dateRange('2026-12-30', '2027-01-01')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
    ]);
  });

  it('weekStart returns the Monday of a Monday–Sunday week', async () => {
    const { weekStart } = await import('./dates');
    expect(weekStart('2026-09-30')).toBe('2026-09-28'); // quarta
    expect(weekStart('2026-09-28')).toBe('2026-09-28'); // segunda
    expect(weekStart('2026-10-04')).toBe('2026-09-28'); // domingo
    expect(weekStart('2027-01-01')).toBe('2026-12-28'); // virada de ano
  });
});
