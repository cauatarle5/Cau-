import { describe, expect, it } from 'vitest';

import { readiness } from '../recovery/readiness';

import { adaptWorkout, type WorkoutExercise } from './adaptation';
import { exercisesPerSession, generateProgram, splitFor, type CatalogExercise } from './generator';
import type { SetLike } from './metrics';
import { periodizedSets, weekPlan } from './periodization';
import { isStagnant, nextTarget, performanceDrop, reducedLoad, type Exposure } from './progression';
import { planSchedule, scheduleWeek } from './schedule';
import { validateProgram } from './validator';
import type { MuscleCode } from './volume';

const s = (loadKg: number, reps: number, rir: number | null = null): SetLike => ({
  setType: 'working',
  loadKg,
  reps,
  rir,
  rpe: null,
  completed: true,
});
const exp = (date: string, sets: SetLike[], adapted = false): Exposure => ({ date, sets, adapted });
const plan = { repMin: 8, repMax: 10, targetRir: 2, incrementKg: 2.5 };

describe('double progression (P8.3)', () => {
  it('all sets at the top with RIR ≥ target − 1 → +increment, reps back to the minimum', () => {
    expect(
      nextTarget([exp('2026-09-01', [s(80, 10, 1), s(80, 10, 2), s(80, 10, 1)])], plan),
    ).toEqual({
      action: 'increase',
      loadKg: 82.5,
      repMin: 8,
      repMax: 10,
    });
  });

  it('within the range → same load, +1 rep on the best set', () => {
    expect(nextTarget([exp('2026-09-01', [s(80, 9), s(80, 8), s(80, 8)])], plan)).toEqual({
      action: 'keep',
      loadKg: 80,
      repMin: 10,
      repMax: 10,
    });
    // RIR abaixo de alvo − 1 no topo: ainda não sobe.
    expect(nextTarget([exp('2026-09-01', [s(80, 10, 0), s(80, 10, 0)])], plan).action).toBe('keep');
  });

  it('reduced load stays within −5% to −10% (closest increment to −7,5%, else exact)', () => {
    expect(reducedLoad(100, 2.5)).toBe(92.5);
    // 20 kg com incremento de 2,5: 17,5 seria −12,5% → 18,5 exato.
    expect(reducedLoad(20, 2.5)).toBe(18.5);
    expect(reducedLoad(60, 1)).toBe(56);
  });

  it('below the minimum in 2 straight exposures → −7,5% rounded down to the increment', () => {
    const t = nextTarget(
      [exp('2026-09-01', [s(100, 7), s(100, 6)]), exp('2026-09-04', [s(100, 7), s(100, 6)])],
      plan,
    );
    // 100 × 0,925 = 92,5 (múltiplo de 2,5)
    expect(t).toMatchObject({ action: 'decrease', loadKg: 92.5 });
    // Uma exposição só abaixo: mantém.
    expect(nextTarget([exp('2026-09-04', [s(100, 7)])], plan).action).toBe('keep');
  });

  it('adapted sessions do not count; no history = none', () => {
    const t = nextTarget(
      [exp('2026-09-01', [s(80, 9)]), exp('2026-09-04', [s(70, 10, 3), s(70, 10, 3)], true)],
      plan,
    );
    expect(t).toMatchObject({ action: 'keep', loadKg: 80 });
    expect(nextTarget([], plan)).toEqual({ action: 'none', loadKg: null, repMin: 8, repMax: 10 });
  });
});

describe('stagnation and performance drop (P8.4)', () => {
  it('best e1RM of the last 4 exposures not ≥ 1% above the one before → stagnant', () => {
    // e1RM: 100×(1+8/30) = 126,67; seguintes 126,67 a 127 (< 127,93) → estagnado.
    const flat = ['01', '04', '08', '11', '15'].map((d) => exp(`2026-09-${d}`, [s(100, 8)]));
    expect(isStagnant(flat, '2026-09-15')).toBe(true);
    const rising = ['01', '04', '08', '11', '15'].map((d, i) =>
      exp(`2026-09-${d}`, [s(100 + i * 2.5, 8)]),
    );
    expect(isStagnant(rising, '2026-09-15')).toBe(false);
  });

  it('21 days without a new best e1RM → stagnant', () => {
    expect(
      isStagnant([exp('2026-09-01', [s(100, 8)]), exp('2026-09-22', [s(95, 8)])], '2026-09-22'),
    ).toBe(true);
  });

  it('drop: session e1RM ≥ 5% below the mean of the previous 3', () => {
    expect(performanceDrop(94, [100, 100, 100])).toBe(true);
    expect(performanceDrop(96, [100, 100, 100])).toBe(false);
    expect(performanceDrop(80, [100, 100])).toBe(false);
  });
});

describe('periodization and schedule (P8.7.5, ADR-043)', () => {
  it('RIR 3/2/2/1 then deload RIR 4; volume ×1,0/1,1/1,15/1,2/0,5', () => {
    expect([0, 1, 2, 3, 4].map((w) => weekPlan(w).rir)).toEqual([3, 2, 2, 1, 4]);
    expect(weekPlan(4)).toMatchObject({ deload: true, volumeFactor: 0.5 });
    expect([1, 1.1, 1.15, 1.2, 0.5].map((f) => periodizedSets(4, f))).toEqual([4, 4, 5, 5, 2]);
  });

  it('cycles templates over gym days and moves leg sessions away from sport days', () => {
    const t = [
      { id: 'upper', lower: false },
      { id: 'lower', lower: true },
    ];
    // Academia seg/ter/qui/sex (1, 2, 4, 5); futebol na quarta (3): ter e qui são vizinhos.
    const week = scheduleWeek(t, [1, 2, 4, 5], [3]);
    expect(week).toEqual([
      { templateId: 'lower', weekday: 1 },
      { templateId: 'upper', weekday: 2 },
      { templateId: 'upper', weekday: 4 },
      { templateId: 'lower', weekday: 5 },
    ]);
    // Começando numa quarta (2026-09-30), academia seg/qui: qui 01/10, seg 05/10, qui 08/10...
    const dates = planSchedule(
      '2026-09-30',
      2,
      [
        { id: 'a', lower: false },
        { id: 'b', lower: false },
      ],
      [1, 4],
    );
    expect(dates.map((d) => [d.date, d.templateId, d.weekIndex])).toEqual([
      ['2026-10-01', 'a', 0],
      ['2026-10-05', 'b', 0],
      ['2026-10-08', 'a', 1],
      ['2026-10-12', 'b', 1],
    ]);
  });

  it('cycles templates continuously across weeks (4 workouts in 3 days: D enters week 2)', () => {
    const t = ['A', 'B', 'C', 'D'].map((id) => ({ id, lower: false }));
    // Segunda 2026-10-05; academia seg/qua/sex.
    const dates = planSchedule('2026-10-05', 2, t, [1, 3, 5]);
    expect(dates.map((d) => d.templateId)).toEqual(['A', 'B', 'C', 'D', 'A', 'B']);
  });
});

const cat = (
  id: string,
  pattern: string,
  primary: MuscleCode[],
  secondary: MuscleCode[] = [],
  extra: Partial<CatalogExercise> = {},
): CatalogExercise => ({
  id,
  name: id,
  movementPattern: pattern,
  mechanics: pattern.startsWith('isolation') || pattern === 'core' ? 'isolation' : 'compound',
  equipmentCodes: ['barbell'],
  contraindicationTags: [],
  primaryMuscles: primary,
  secondaryMuscles: secondary,
  ...extra,
});

const catalog: CatalogExercise[] = [
  cat('agachamento', 'squat', ['quads', 'glutes'], ['hamstrings'], {
    contraindicationTags: ['deep_knee_flexion'],
  }),
  cat('leg press', 'squat', ['quads'], ['glutes'], { equipmentCodes: ['leg_press'] }),
  cat('supino', 'horizontal_push', ['chest'], ['triceps', 'front_delts']),
  cat('supino halteres', 'horizontal_push', ['chest'], ['triceps'], {
    equipmentCodes: ['dumbbell'],
  }),
  cat('puxada', 'vertical_pull', ['lats'], ['biceps'], { equipmentCodes: ['cable'] }),
  cat('terra', 'hinge', ['hamstrings', 'glutes'], ['lower_back'], {
    contraindicationTags: ['heavy_hinge'],
  }),
  cat('desenvolvimento', 'vertical_push', ['front_delts'], ['triceps']),
  cat('remada', 'horizontal_pull', ['upper_back', 'lats'], ['biceps']),
  cat('elevação lateral', 'isolation_upper', ['side_delts'], [], { equipmentCodes: ['dumbbell'] }),
  cat('rosca', 'isolation_upper', ['biceps'], [], { equipmentCodes: ['dumbbell'] }),
  cat('tríceps polia', 'isolation_upper', ['triceps'], [], { equipmentCodes: ['cable'] }),
  cat('passada', 'lunge', ['quads', 'glutes'], [], { equipmentCodes: ['dumbbell'] }),
  cat('cadeira extensora', 'isolation_lower', ['quads'], [], { equipmentCodes: ['machine'] }),
  cat('mesa flexora', 'isolation_lower', ['hamstrings'], [], { equipmentCodes: ['machine'] }),
  cat('panturrilha', 'isolation_lower', ['calves'], [], { equipmentCodes: ['machine'] }),
];

const genInput = {
  days: 3,
  minutesPerSession: 60,
  exercises: catalog,
  availableEquipment: null,
  preferences: new Map(),
  contraindicated: new Set<string>(),
  priorities: new Set<string>(),
};

describe('program generator (P8.7)', () => {
  it('split by days and exercises per session', () => {
    expect(splitFor(3).split).toBe('full_body');
    expect(splitFor(4).sessions).toEqual(['upper', 'lower', 'upper', 'lower']);
    expect(splitFor(5).split).toBe('upper_lower_ppl');
    expect(splitFor(6).split).toBe('ppl');
    expect([30, 45, 60, 90].map(exercisesPerSession)).toEqual([4, 5, 6, 8]);
  });

  it('full body: compounds first, variety across sessions, volume toward the productive band within time', () => {
    const { split, templates } = generateProgram(genInput);
    expect(split).toBe('full_body');
    expect(templates.map((t) => t.name)).toEqual(['Full body A', 'Full body B', 'Full body C']);
    for (const t of templates) {
      expect(t.exercises).toHaveLength(6);
      expect(t.exercises[0]?.repMin).toBe(6);
    }
    // A e B escolhem agachamentos diferentes (variedade).
    expect(templates[0]?.exercises[0]?.name).toBe('agachamento');
    expect(templates[1]?.exercises[0]?.name).toBe('leg press');
    const v = validateProgram({
      templates: templates.map((t) => ({
        name: t.name,
        exercises: t.exercises.map((x) => ({
          exercise: catalog.find((c) => c.id === x.exerciseId) as CatalogExercise,
          sets: x.sets,
          restSeconds: x.restSeconds,
        })),
      })),
      minutesPerSession: 60,
      contraindicated: new Set(),
      priorities: new Set(),
      muscleNames: new Map(),
    });
    expect(v.filter((w) => w.code === 'SESSION_TOO_LONG' || w.code === 'VOLUME_HIGH')).toEqual([]);
  });

  it('respects equipment, avoid and limitations', () => {
    const { templates } = generateProgram({
      ...genInput,
      availableEquipment: new Set(['dumbbell', 'cable', 'machine']),
      preferences: new Map([['tríceps polia', 'avoid' as const]]),
      contraindicated: new Set(['heavy_hinge']),
    });
    const names = templates.flatMap((t) => t.exercises.map((x) => x.name));
    expect(names).not.toContain('supino');
    expect(names).not.toContain('terra');
    expect(names).not.toContain('tríceps polia');
    expect(names).toContain('supino halteres');
  });
});

describe('validator (P8.7.7)', () => {
  it('flags long sessions, contraindicated exercises and leg sessions next to sport days', () => {
    const squat = catalog[0] as CatalogExercise;
    const warnings = validateProgram({
      templates: [{ name: 'Pernas', exercises: [{ exercise: squat, sets: 12, restSeconds: 240 }] }],
      minutesPerSession: 30,
      contraindicated: new Set(['deep_knee_flexion']),
      priorities: new Set(),
      muscleNames: new Map([['chest', 'Peitoral']]),
      schedule: [{ template: 'Pernas', weekday: 4 }],
      sportDays: [3],
    });
    expect(warnings.map((w) => w.code).sort()).toEqual(
      [
        'CONTRAINDICATED',
        'LEGS_NEAR_SPORT',
        'SESSION_TOO_LONG',
        'VOLUME_LOW',
        'VOLUME_LOW',
        'VOLUME_LOW',
        'VOLUME_LOW',
        'VOLUME_LOW',
      ].sort(),
    );
    expect(warnings.find((w) => w.code === 'VOLUME_LOW' && w.muscle === 'chest')?.message).toBe(
      'Peitoral: 0 séries duras por semana, abaixo do mínimo efetivo (8).',
    );
  });
});

const wex = (
  name: string,
  pattern: string,
  primary: MuscleCode[],
  sets = 4,
  extra: Partial<WorkoutExercise> = {},
): WorkoutExercise => ({
  exerciseId: name,
  name,
  sets,
  repMin: 6,
  repMax: 10,
  targetRir: 2,
  restSeconds: 120,
  movementPattern: pattern,
  mechanics: pattern.startsWith('isolation') ? 'isolation' : 'compound',
  primaryMuscles: primary,
  contraindicationTags: [],
  ...extra,
});

describe('adaptation (P8.6, ADR-045)', () => {
  const session = [
    wex('Agachamento', 'squat', ['quads', 'glutes']),
    wex('Supino', 'horizontal_push', ['chest']),
    wex('Levantamento terra', 'hinge', ['hamstrings', 'glutes']),
    wex('Remada', 'horizontal_pull', ['upper_back']),
    wex('Rosca', 'isolation_upper', ['biceps'], 3),
  ];

  it('DoD Fase 5: intense football yesterday + bad night → light leg-sparing session with a coherent explanation', () => {
    const r = readiness(
      { sleepHours: 4, sleepQuality: 1, energy: 2, stress: 3, fatigue: 4, soreness: 3 },
      { hardLowerBodyActivity24h: true, lowerBodySession: true },
    );
    // 34 − 10 (esporte de pernas nas últimas 24 h) = 24 → vermelho.
    expect(r).toMatchObject({ score: 24, band: 'red' });
    const a = adaptWorkout(session, {
      readiness: r,
      sportYesterday: { sport: 'football', rpe: 8 },
      sportTomorrow: null,
      pain: [],
      availableMinutes: null,
    });
    expect(a.mode).toBe('light');
    expect(a.changed).toBe(true);
    // Leve: ⌈4 × 0,5⌉ = 2 séries, RIR 4; agachamento (pernas): round(2 × 0,6) = 1; terra removido.
    expect(a.exercises.map((e) => [e.name, e.removed ? 0 : e.sets, e.targetRir])).toEqual([
      ['Agachamento', 1, 4],
      ['Supino', 2, 4],
      ['Levantamento terra', 0, 4],
      ['Remada', 2, 4],
      ['Rosca', 2, 4],
    ]);
    expect(a.explanation).toEqual([
      'Sua prontidão hoje está em 24 (pouca disposição, fadiga alta): sessão leve, com metade das séries e 4 repetições de reserva.',
      'Reduzi o volume de pernas e tirei Levantamento terra porque você jogou futebol ontem com intensidade 8.',
    ]);
  });

  it('sport tomorrow lightens legs by 30%; red + rest removes everything', () => {
    const t = adaptWorkout(session, {
      readiness: { score: 85, band: 'green', drivers: [] },
      sportYesterday: null,
      sportTomorrow: { sport: 'football' },
      pain: [],
      availableMinutes: null,
    });
    // round(4 × 0,7) = 3 nas pernas; superiores intactos; não é adaptação por prontidão.
    expect(t.exercises.map((e) => e.sets)).toEqual([3, 4, 3, 4, 3]);
    expect(t.readinessAdapted).toBe(false);
    expect(t.explanation).toEqual(['Aliviei as pernas porque há esporte nas próximas 24 horas.']);
    const rest = adaptWorkout(session, {
      readiness: { score: 30, band: 'red', drivers: ['sleep'] },
      sportYesterday: null,
      sportTomorrow: null,
      pain: [],
      availableMinutes: null,
      redChoice: 'rest',
    });
    expect(rest.mode).toBe('rest');
    expect(rest.exercises.every((e) => e.removed)).toBe(true);
    expect(rest.readinessAdapted).toBe(true);
  });

  it('yellow: −1 set, RIR +1, no records; green with nothing else = unchanged', () => {
    const y = adaptWorkout(session, {
      readiness: { score: 60, band: 'yellow', drivers: ['sleep'] },
      sportYesterday: null,
      sportTomorrow: null,
      pain: [],
      availableMinutes: null,
    });
    expect(y.exercises.map((e) => [e.sets, e.targetRir])[0]).toEqual([3, 3]);
    expect(y.noRecords).toBe(true);
    expect(y.explanation[0]).toContain('prontidão hoje está em 60 (sono ruim)');
    const g = adaptWorkout(session, {
      readiness: { score: 85, band: 'green', drivers: [] },
      sportYesterday: null,
      sportTomorrow: null,
      pain: [],
      availableMinutes: null,
    });
    expect(g.changed).toBe(false);
    expect(g.explanation).toEqual([]);
  });

  it('pain ≥ 4 flags linked exercises; ≥ 7 asks for a professional; time cuts isolations first, never the first exercise', () => {
    const a = adaptWorkout(session, {
      readiness: { score: null, band: 'unknown', drivers: [] },
      sportYesterday: null,
      sportTomorrow: null,
      pain: [{ region: 'knee', intensity: 7 }],
      availableMinutes: 40,
    });
    expect(a.exercises.find((e) => e.name === 'Agachamento')?.substitute).toBe(true);
    expect(a.seeProfessional).toBe(true);
    expect(a.exercises.find((e) => e.name === 'Rosca')?.removed).toBe(true);
    expect(a.exercises[0]?.removed).toBe(false);
    expect(a.explanation.at(-1)).toBe('Ajustei a sessão para caber em 40 minutos.');
  });
});
