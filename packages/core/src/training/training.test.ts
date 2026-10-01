import { describe, expect, it } from 'vitest';

import { rankAlternatives, type ExerciseLite } from './alternatives';
import { ghostsFor } from './ghosts';
import {
  bestE1rm,
  durationMinutes,
  effectiveRir,
  estimateE1rm,
  isHardSet,
  rirFromRpe,
  sessionStats,
  setRowCount,
  tonnage,
  type SetLike,
} from './metrics';
import { detectSessionVolumeRecord, detectSetRecords, recordTimeline } from './records';
import { muscleVolume, volumeStatus } from './volume';

const set = (
  loadKg: number | null,
  reps: number | null,
  extra: Partial<SetLike> = {},
): SetLike => ({
  setType: 'working',
  reps,
  loadKg,
  rir: null,
  rpe: null,
  completed: true,
  ...extra,
});

describe('e1RM (Epley, P8.1)', () => {
  it('load × (1 + reps/30)', () => {
    expect(estimateE1rm(set(100, 5))).toBeCloseTo(116.667, 3);
    expect(estimateE1rm(set(80, 10))).toBeCloseTo(106.667, 3);
  });
  it('uses effective reps = reps + RIR capped at 12', () => {
    // 100 × (1 + (5+2)/30) = 123,33
    expect(estimateE1rm(set(100, 5, { rir: 2 }))).toBeCloseTo(123.333, 3);
    // 10 + 4 → 12: 80 × 1,4 = 112
    expect(estimateE1rm(set(80, 10, { rir: 4 }))).toBeCloseTo(112, 6);
    // RPE 8 → RIR 2
    expect(estimateE1rm(set(100, 5, { rpe: 8 }))).toBeCloseTo(123.333, 3);
  });
  it('only working sets with 1–12 reps', () => {
    expect(estimateE1rm(set(100, 13))).toBeNull();
    expect(estimateE1rm(set(100, 0))).toBeNull();
    expect(estimateE1rm(set(60, 10, { setType: 'warmup' }))).toBeNull();
    expect(estimateE1rm(set(100, 5, { completed: false }))).toBeNull();
    expect(estimateE1rm(set(0, 10))).toBeNull();
  });
  it('best e1RM of a list', () => {
    expect(bestE1rm([set(100, 5), set(90, 10), set(60, 12, { setType: 'warmup' })])).toBeCloseTo(
      120,
      6,
    );
  });
});

describe('RIR/RPE and hard sets', () => {
  it('RIR = 10 − RPE', () => {
    expect(rirFromRpe(8)).toBe(2);
    expect(effectiveRir({ rir: null, rpe: 9 })).toBe(1);
    expect(effectiveRir({ rir: 3, rpe: 9 })).toBe(3);
    expect(effectiveRir({ rir: null, rpe: null })).toBeNull();
  });
  it('hard set: working with RIR ≤ 3 or RPE ≥ 7; no data counts', () => {
    expect(isHardSet(set(100, 5, { rir: 3 }))).toBe(true);
    expect(isHardSet(set(100, 5, { rir: 4 }))).toBe(false);
    expect(isHardSet(set(100, 5, { rpe: 7 }))).toBe(true);
    expect(isHardSet(set(100, 5, { rpe: 6 }))).toBe(false);
    expect(isHardSet(set(100, 5))).toBe(true);
    expect(isHardSet(set(40, 10, { setType: 'warmup' }))).toBe(false);
  });
  it('tonnage = Σ load × reps of working sets', () => {
    expect(tonnage([set(100, 5), set(100, 5), set(60, 10, { setType: 'warmup' })])).toBe(1000);
  });
  it('session stats: best e1RM, top load, tonnage, working and hard sets', () => {
    const stats = sessionStats([
      set(60, 10, { setType: 'warmup' }),
      set(100, 5, { rir: 1 }),
      set(90, 8, { rir: 4 }),
      set(100, 4, { completed: false }),
    ]);
    // 100 × (1 + 6/30) = 120; 90 × (1 + 12/30) = 126
    expect(stats.bestE1rm).toBeCloseTo(126, 6);
    expect(stats.topLoadKg).toBe(100);
    expect(stats.tonnage).toBe(1220);
    expect(stats.workingSets).toBe(2);
    expect(stats.hardSets).toBe(1);
    expect(sessionStats([])).toEqual({
      bestE1rm: null,
      topLoadKg: null,
      tonnage: 0,
      workingSets: 0,
      hardSets: 0,
    });
  });
});

describe('muscle volume and frequency (P8.1/P8.2)', () => {
  const bench = [
    { muscle: 'chest' as const, weight: 1 },
    { muscle: 'triceps' as const, weight: 0.5 },
    { muscle: 'front_delts' as const, weight: 0.5 },
  ];
  it('Σ hard sets × muscle weight; frequency = days with ≥ 2 weighted hard sets', () => {
    const v = muscleVolume([
      {
        date: '2026-09-28',
        muscles: bench,
        sets: [set(80, 8), set(80, 8), set(80, 8, { rir: 5 })],
      },
      {
        date: '2026-10-01',
        muscles: bench,
        sets: [set(80, 8), set(80, 8), set(80, 8), set(80, 8)],
      },
    ]);
    const chest = v.find((x) => x.muscle === 'chest');
    const triceps = v.find((x) => x.muscle === 'triceps');
    // Peito: 2 + 4 = 6; tríceps: 0,5 × 6 = 3 (seg 1,0 < 2, qui 2,0 ≥ 2 → frequência 1)
    expect(chest).toEqual({ muscle: 'chest', hardSets: 6, frequency: 2 });
    expect(triceps).toEqual({ muscle: 'triceps', hardSets: 3, frequency: 1 });
  });
  it('volume bands 8 / 10–20 / 22; calves and abs exempt below MEV unless priority', () => {
    expect(volumeStatus('chest', 6)).toEqual({ status: 'below_mev', alert: true });
    expect(volumeStatus('chest', 9)).toEqual({ status: 'minimum', alert: false });
    expect(volumeStatus('chest', 15)).toEqual({ status: 'productive', alert: false });
    expect(volumeStatus('chest', 21)).toEqual({ status: 'high', alert: false });
    expect(volumeStatus('chest', 23)).toEqual({ status: 'above_mrv', alert: true });
    expect(volumeStatus('calves', 4)).toEqual({ status: 'below_mev', alert: false });
    expect(volumeStatus('abs', 4, { priority: true }).alert).toBe(true);
  });
});

describe('records (P8.1)', () => {
  const history = [set(100, 5), set(100, 6), set(90, 8)];
  it('detects e1RM, max load and reps at load', () => {
    expect(detectSetRecords(set(105, 5), history).map((r) => r.type)).toEqual(['e1rm', 'max_load']);
    // 100 × 7: e1RM 123,3 > 120; reps na carga 100 (máx anterior 6)
    expect(detectSetRecords(set(100, 7), history).map((r) => r.type)).toEqual([
      'e1rm',
      'rep_at_load',
    ]);
    expect(detectSetRecords(set(90, 7), history)).toEqual([]);
  });
  it('no records on first exposure or for warmups', () => {
    expect(detectSetRecords(set(100, 5), [])).toEqual([]);
    expect(detectSetRecords(set(200, 5, { setType: 'warmup' }), history)).toEqual([]);
  });
  it('session tonnage record', () => {
    expect(
      detectSessionVolumeRecord([set(100, 5), set(100, 5)], [[set(100, 5), set(90, 5)]])?.value,
    ).toBe(1000);
    expect(detectSessionVolumeRecord([set(100, 5)], [[set(100, 5), set(90, 5)]])).toBeNull();
    expect(detectSessionVolumeRecord([set(100, 5)], [])).toBeNull();
  });
});

describe('ghosts', () => {
  it('last session values by set index; extra sets repeat the last working set', () => {
    const last = [
      { ...set(60, 10, { setType: 'warmup' }), setIndex: 0 },
      { ...set(80, 10, { rir: 2 }), setIndex: 1 },
      { ...set(80, 9, { rir: 1 }), setIndex: 2 },
    ];
    expect(ghostsFor(3, last)).toEqual([
      { setIndex: 0, loadKg: 80, reps: 10, rir: 2 },
      { setIndex: 1, loadKg: 80, reps: 9, rir: 1 },
      { setIndex: 2, loadKg: 80, reps: 9, rir: 1 },
    ]);
    expect(ghostsFor(2, [])).toEqual([
      { setIndex: 0, loadKg: null, reps: null, rir: null },
      { setIndex: 1, loadKg: null, reps: null, rir: null },
    ]);
  });
});

describe('rankAlternatives (P8.4)', () => {
  const ex = (id: string, extra: Partial<ExerciseLite> = {}): ExerciseLite => ({
    id,
    movementPattern: 'horizontal_push',
    mechanics: 'compound',
    equipmentCodes: ['barbell', 'bench'],
    contraindicationTags: [],
    primaryMuscles: ['chest'],
    ...extra,
  });
  const target = ex('bench');
  const candidates = [
    target,
    ex('db-bench', { equipmentCodes: ['dumbbell', 'bench'] }),
    ex('pushup', { equipmentCodes: ['bodyweight'] }),
    ex('fly', {
      movementPattern: 'isolation_upper',
      mechanics: 'isolation',
      equipmentCodes: ['cable'],
    }),
    ex('squat', {
      movementPattern: 'squat',
      primaryMuscles: ['quads'],
      equipmentCodes: ['barbell'],
    }),
    ex('dips', { equipmentCodes: ['dip_station'], contraindicationTags: ['shoulder_extension'] }),
    ex('machine-press', { equipmentCodes: ['machine'] }),
  ];

  it('filters by pattern/primary muscle, equipment, avoid and contraindications; likes first', () => {
    const ranked = rankAlternatives(target, candidates, {
      availableEquipment: new Set(['dumbbell', 'bench', 'cable', 'dip_station', 'machine']),
      preferences: new Map([
        ['machine-press', 'avoid'],
        ['pushup', 'like'],
      ]),
      contraindicated: new Set(['shoulder_extension']),
    });
    expect(ranked.map((r) => r.exercise.id)).toEqual(['pushup', 'db-bench', 'fly']);
  });

  it('no equipment list means no equipment restriction', () => {
    const ranked = rankAlternatives(target, candidates, {
      availableEquipment: null,
      preferences: new Map(),
      contraindicated: new Set(),
    });
    expect(ranked.map((r) => r.exercise.id)).toContain('machine-press');
    expect(ranked.map((r) => r.exercise.id)).not.toContain('squat');
  });

  it('ties: closest name variation first, then alphabetical (deterministic)', () => {
    const named = (id: string, name: string) => ex(id, { name, equipmentCodes: ['bodyweight'] });
    const ranked = rankAlternatives(
      { ...target, name: 'Supino reto com barra' },
      [
        named('a', 'Supino no Smith'),
        named('b', 'Flexão de braço'),
        named('c', 'Supino reto com halteres'),
        named('d', 'Supino inclinado com halteres'),
      ],
      { availableEquipment: null, preferences: new Map(), contraindicated: new Set() },
    );
    expect(ranked.map((r) => r.exercise.name)).toEqual([
      'Supino reto com halteres',
      'Supino inclinado com halteres',
      'Supino no Smith',
      'Flexão de braço',
    ]);
  });
});

describe('recordTimeline (recalculável)', () => {
  const ts = (id: string, loadKg: number, reps: number, extra: Partial<SetLike> = {}) => ({
    id,
    ...set(loadKg, reps, extra),
  });

  it('first real exposure is a reference even after a warmup-only session', () => {
    const t = recordTimeline([
      { id: 's0', finished: true, sets: [ts('w', 40, 10, { setType: 'warmup' })] },
      { id: 's1', finished: true, sets: [ts('a', 60, 10), ts('b', 62.5, 10)] },
      { id: 's2', finished: true, sets: [ts('c', 65, 10)] },
    ]);
    expect(t.bySet.has('a')).toBe(false);
    expect(t.bySet.has('b')).toBe(false);
    expect(t.bySet.get('c')?.map((h) => h.type)).toEqual(['e1rm', 'max_load']);
    // s1 é a primeira tonelagem > 0; s2 (650) < s1 (1225) não é recorde.
    expect(t.bySession.size).toBe(0);
  });

  it('within a session compares with earlier sets; removing a mistaken set restores records', () => {
    const base = { id: 's1', finished: true, sets: [ts('a', 100, 5)] };
    const withMistake = recordTimeline([
      base,
      { id: 's2', finished: true, sets: [ts('x', 200, 5), ts('y', 105, 5)] },
    ]);
    expect(withMistake.bySet.has('y')).toBe(false);
    const fixed = recordTimeline([base, { id: 's2', finished: true, sets: [ts('y', 105, 5)] }]);
    expect(fixed.bySet.get('y')?.map((h) => h.type)).toEqual(['e1rm', 'max_load']);
    expect(fixed.bySession.get('s2')?.value).toBe(525);
  });

  it('unfinished sessions get set records but no tonnage record', () => {
    const t = recordTimeline([
      { id: 's1', finished: true, sets: [ts('a', 100, 5)] },
      { id: 's2', finished: false, sets: [ts('b', 100, 6)] },
    ]);
    expect(t.bySet.get('b')?.map((h) => h.type)).toEqual(['e1rm', 'rep_at_load']);
    expect(t.bySession.size).toBe(0);
  });
});

describe('session helpers', () => {
  it('setRowCount = max(target, ghosts, highest logged index + 1, 1) + extra', () => {
    expect(setRowCount(3, 0, [], 0)).toBe(3);
    expect(setRowCount(null, 4, [0], 0)).toBe(4);
    expect(setRowCount(3, 3, [0, 4], 1)).toBe(6);
    expect(setRowCount(null, 0, [])).toBe(1);
  });
  it('durationMinutes rounds to whole minutes', () => {
    expect(
      durationMinutes(new Date('2026-09-30T10:00:00Z'), new Date('2026-09-30T11:02:29Z')),
    ).toBe(62);
  });
});
