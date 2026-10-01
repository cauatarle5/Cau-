import { describe, expect, it } from 'vitest';

import { loadSeries, sessionLoad } from './load';
import { readiness } from './readiness';

const good = { sleepHours: 8, sleepQuality: 5, energy: 5, stress: 1, fatigue: 1, soreness: 1 };

describe('readiness (P8.5)', () => {
  it('perfect check-in = 100, green', () => {
    expect(readiness(good)).toEqual({ score: 100, band: 'green', drivers: [] });
  });

  it('bad night: weighted components by hand', () => {
    // Sono: min(4/8,1)×0,6 + (1−1)/4×0,4 = 0,3 → 9 pts; disposição (2−1)/4 = 0,25 → 5;
    // fadiga (5−4)/4 = 0,25 → 5; dor (5−3)/4 = 0,5 → 7,5; estresse (5−3)/4 = 0,5 → 7,5 = 34.
    const r = readiness({
      sleepHours: 4,
      sleepQuality: 1,
      energy: 2,
      stress: 3,
      fatigue: 4,
      soreness: 3,
    });
    expect(r.score).toBe(34);
    expect(r.band).toBe('red');
    expect(r.drivers).toEqual(['energy', 'fatigue', 'sleep']);
  });

  it('adjustments: −10 for ACWR > 1,5 and −10 for hard lower-body sport only on leg sessions', () => {
    const base = readiness(good, { acwr: 1.6 });
    expect(base.score).toBe(90);
    expect(base.drivers).toEqual(['high_acwr']);
    expect(readiness(good, { hardLowerBodyActivity24h: true, lowerBodySession: false }).score).toBe(
      100,
    );
    const legs = readiness(good, { hardLowerBodyActivity24h: true, lowerBodySession: true });
    expect(legs.score).toBe(90);
    expect(legs.drivers).toEqual(['sport_yesterday']);
  });

  it('no check-in = unknown; bands at 70 and 50', () => {
    expect(readiness(null)).toEqual({ score: null, band: 'unknown', drivers: [] });
    // 0,3×1 + 0,2×0,5 + 0,2×0,5 + 0,15×0,5 + 0,15×0,5 = 0,65 → 65 (amarelo)
    expect(readiness({ ...good, energy: 3, fatigue: 3, soreness: 3, stress: 3 }).band).toBe(
      'yellow',
    );
  });
});

describe('internal load (P8.5, ADR-044)', () => {
  it('sRPE = RPE × minutes', () => {
    expect(sessionLoad(8, 90)).toBe(720);
    expect(sessionLoad(null, 60)).toBe(0);
  });

  it('steady load: ACWR ≈ 1, monotony undefined (no variation)', () => {
    const entries = Array.from({ length: 60 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
      au: 100,
    }));
    const [last] = loadSeries(entries, '2026-03-01', '2026-03-01');
    expect(last?.acute7d).toBe(700);
    // EWMA a partir de zero após 60 dias de 100: 100 × (1 − (1 − 2/29)^60) × 7 ≈ 690,5.
    const alpha = 2 / 29;
    expect(last?.chronic28d).toBeCloseTo(700 * (1 - (1 - alpha) ** 60), 6);
    expect(last?.acwr).toBeCloseTo(1 / (1 - (1 - alpha) ** 60), 6);
    expect(last?.monotony7d).toBeNull();
  });

  it('ACWR is undefined until the history covers 28 days', () => {
    const [s] = loadSeries([{ date: '2026-09-30', au: 720 }], '2026-10-01', '2026-10-01');
    expect(s?.acute7d).toBe(720);
    expect(s?.acwr).toBeNull();
  });

  it('spike after a light month raises ACWR above 1,5; monotony and strain by hand', () => {
    const entries = [
      ...Array.from({ length: 28 }, (_, i) => ({
        date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
        au: 100,
      })),
      // Semana de 29/01 a 04/02: 500, 0, 500, 0, 500, 0, 500
      ...[500, 0, 500, 0, 500, 0, 500].map((au, i) => ({
        date: new Date(Date.UTC(2026, 0, 29 + i)).toISOString().slice(0, 10),
        au,
      })),
    ];
    const [s] = loadSeries(entries, '2026-02-04', '2026-02-04');
    expect(s?.acute7d).toBe(2000);
    expect(s?.acwr).toBeGreaterThan(1.5);
    // Média 285,71; desvio (população) 247,44 → monotonia 1,1547; strain = 2000 × 1,1547.
    expect(s?.monotony7d).toBeCloseTo(1.1547, 4);
    expect(s?.strain7d).toBeCloseTo(2309.4, 1);
  });
});
