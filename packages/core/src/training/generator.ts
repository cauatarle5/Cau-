import type { Preference } from './alternatives';
import { muscleVolume, VOLUME_LANDMARKS, type MuscleCode } from './volume';

export interface CatalogExercise {
  id: string;
  name: string;
  movementPattern: string;
  mechanics: 'compound' | 'isolation';
  equipmentCodes: readonly string[];
  contraindicationTags: readonly string[];
  primaryMuscles: readonly MuscleCode[];
  secondaryMuscles: readonly MuscleCode[];
}

export interface GeneratorInput {
  days: number;
  minutesPerSession: number;
  exercises: readonly CatalogExercise[];
  /** `null` = sem restrição. */
  availableEquipment: ReadonlySet<string> | null;
  preferences: ReadonlyMap<string, Preference>;
  /** Tags e padrões contraindicados pelas limitações ativas. */
  contraindicated: ReadonlySet<string>;
  priorities: ReadonlySet<string>;
}

export interface GeneratedExercise {
  exerciseId: string;
  name: string;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSeconds: number;
}

export interface GeneratedTemplate {
  name: string;
  focusMuscles: MuscleCode[];
  exercises: GeneratedExercise[];
}

export type Split = 'full_body' | 'upper_lower' | 'upper_lower_ppl' | 'ppl';

type Slot = { pattern: string } | { muscle: MuscleCode };

const P = (pattern: string): Slot => ({ pattern });
const M = (muscle: MuscleCode): Slot => ({ muscle });

/** Blocos de sessão: ordem = prioridade (compostos antes de isolados). */
const BLUEPRINTS = {
  full: {
    name: 'Full body',
    focus: ['quads', 'chest', 'lats', 'hamstrings', 'front_delts', 'upper_back'] as MuscleCode[],
    slots: [
      P('squat'),
      P('horizontal_push'),
      P('vertical_pull'),
      P('hinge'),
      P('vertical_push'),
      P('horizontal_pull'),
      M('side_delts'),
      M('biceps'),
      M('triceps'),
    ],
  },
  upper: {
    name: 'Superior',
    focus: ['chest', 'lats', 'upper_back', 'front_delts', 'biceps', 'triceps'] as MuscleCode[],
    slots: [
      P('horizontal_push'),
      P('horizontal_pull'),
      P('vertical_push'),
      P('vertical_pull'),
      M('side_delts'),
      M('biceps'),
      M('triceps'),
      M('rear_delts'),
    ],
  },
  lower: {
    name: 'Inferior',
    focus: ['quads', 'hamstrings', 'glutes', 'calves'] as MuscleCode[],
    slots: [
      P('squat'),
      P('hinge'),
      P('lunge'),
      M('quads'),
      M('hamstrings'),
      M('calves'),
      M('abs'),
      M('glutes'),
    ],
  },
  push: {
    name: 'Empurrar',
    focus: ['chest', 'front_delts', 'side_delts', 'triceps'] as MuscleCode[],
    slots: [
      P('horizontal_push'),
      P('vertical_push'),
      P('horizontal_push'),
      M('side_delts'),
      M('triceps'),
      M('chest'),
    ],
  },
  pull: {
    name: 'Puxar',
    focus: ['lats', 'upper_back', 'rear_delts', 'biceps'] as MuscleCode[],
    slots: [
      P('vertical_pull'),
      P('horizontal_pull'),
      P('horizontal_pull'),
      M('rear_delts'),
      M('biceps'),
      M('forearms'),
    ],
  },
  legs: {
    name: 'Pernas',
    focus: ['quads', 'hamstrings', 'glutes', 'calves'] as MuscleCode[],
    slots: [P('squat'), P('hinge'), P('lunge'), M('quads'), M('hamstrings'), M('calves'), M('abs')],
  },
} as const;

type BlueprintKey = keyof typeof BLUEPRINTS;

/** Divisão pelo número de dias (P8.7.1). */
export function splitFor(days: number): { split: Split; sessions: BlueprintKey[] } {
  if (days <= 3)
    return { split: 'full_body', sessions: Array<BlueprintKey>(Math.max(2, days)).fill('full') };
  if (days === 4) return { split: 'upper_lower', sessions: ['upper', 'lower', 'upper', 'lower'] };
  if (days === 5)
    return { split: 'upper_lower_ppl', sessions: ['upper', 'lower', 'push', 'pull', 'legs'] };
  return { split: 'ppl', sessions: ['push', 'pull', 'legs', 'push', 'pull', 'legs'] };
}

/** Exercícios por sessão (P8.7.2): ⌊minutos / 9⌋ entre 4 e 8. */
export const exercisesPerSession = (minutes: number) =>
  Math.min(8, Math.max(4, Math.floor(minutes / 9)));

const LOWER_PATTERNS = new Set(['squat', 'hinge', 'lunge']);
const REST = { compound: 150, isolation: 90 } as const;
/** Minutos estimados por série: descanso + ~45 s de execução. */
export function estimateMinutes(exercises: readonly { sets: number; restSeconds: number }[]) {
  return 5 + exercises.reduce((a, e) => a + (e.sets * (e.restSeconds + 45)) / 60, 0);
}

function usable(e: CatalogExercise, input: GeneratorInput) {
  if (input.preferences.get(e.id) === 'avoid') return false;
  if (e.contraindicationTags.some((t) => input.contraindicated.has(t))) return false;
  if (input.contraindicated.has(e.movementPattern)) return false;
  if (e.movementPattern === 'cardio' || e.movementPattern === 'carry') return false;
  const eq = input.availableEquipment;
  return !eq || eq.size === 0 || e.equipmentCodes.every((c) => c === 'bodyweight' || eq.has(c));
}

function matches(e: CatalogExercise, slot: Slot) {
  if ('pattern' in slot) return e.movementPattern === slot.pattern;
  return e.mechanics === 'isolation' && e.primaryMuscles[0] === slot.muscle;
}

/**
 * Gerador de programa por regras (P8.7): divisão, número de exercícios, seleção por padrão e
 * músculo (equipamento, `avoid`, limitações, `like` primeiro, variedade entre sessões do mesmo
 * tipo) e séries para levar cada músculo à faixa produtiva dentro do tempo da sessão.
 */
export function generateProgram(input: GeneratorInput): {
  split: Split;
  templates: GeneratedTemplate[];
} {
  const { split, sessions } = splitFor(input.days);
  const perSession = exercisesPerSession(input.minutesPerSession);
  const pool = input.exercises.filter((e) => usable(e, input));
  const usedByType = new Map<BlueprintKey, Set<string>>();
  const byId = new Map(pool.map((e) => [e.id, e]));

  const templates = sessions.map((key, si) => {
    const bp = BLUEPRINTS[key];
    const used = usedByType.get(key) ?? new Set<string>();
    usedByType.set(key, used);
    const inSession = new Set<string>();
    const variant = sessions.slice(0, si).filter((k) => k === key).length;
    const chosen: GeneratedExercise[] = [];
    for (const slot of bp.slots) {
      if (chosen.length >= perSession) break;
      const ranked = pool
        .filter((e) => matches(e, slot) && !inSession.has(e.id))
        .map((e) => {
          const pref = input.preferences.get(e.id);
          const score =
            (pref === 'like' ? 2 : pref === 'dislike' ? -2 : 0) +
            (used.has(e.id) ? -1 : 0) +
            ('pattern' in slot && e.mechanics === 'compound' ? 0.5 : 0);
          return { e, score };
        })
        .sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name));
      const pick = ranked[0]?.e;
      if (!pick) continue;
      inSession.add(pick.id);
      used.add(pick.id);
      const compound = pick.mechanics === 'compound';
      const lower = LOWER_PATTERNS.has(pick.movementPattern);
      chosen.push({
        exerciseId: pick.id,
        name: pick.name,
        sets: 3,
        repMin: compound ? (lower ? 6 : 6) : 10,
        repMax: compound ? 10 : 15,
        targetRir: 2,
        restSeconds: compound ? REST.compound : REST.isolation,
      });
    }
    const suffix =
      sessions.filter((k) => k === key).length > 1 ? ` ${String.fromCharCode(65 + variant)}` : '';
    return { name: `${bp.name}${suffix}`, focusMuscles: [...bp.focus], exercises: chosen };
  });

  balanceVolume(templates, byId, input);
  return { split, templates };
}

function weeklyVolume(
  templates: readonly GeneratedTemplate[],
  byId: ReadonlyMap<string, CatalogExercise>,
) {
  return new Map(
    muscleVolume(
      templates.flatMap((t) =>
        t.exercises.flatMap((x) => {
          const e = byId.get(x.exerciseId);
          if (!e) return [];
          return [
            {
              date: t.name,
              muscles: [
                ...e.primaryMuscles.map((m) => ({ muscle: m, weight: 1 })),
                ...e.secondaryMuscles.map((m) => ({ muscle: m, weight: 0.5 })),
              ],
              sets: Array.from({ length: x.sets }, () => ({
                setType: 'working' as const,
                reps: x.repMin,
                loadKg: null,
                rir: x.targetRir,
                rpe: null,
                completed: true,
              })),
            },
          ];
        }),
      ),
    ).map((v) => [v.muscle, v.hardSets]),
  );
}

/**
 * Volume (P8.7.4): sobe séries (até 5 por exercício) nos exercícios do músculo mais abaixo do
 * alvo — 10 séries, ou 17 para prioridades (terço superior da faixa) — enquanto a sessão couber
 * no tempo; tira séries de músculos acima do MRV (mínimo 2 por exercício).
 */
function balanceVolume(
  templates: GeneratedTemplate[],
  byId: ReadonlyMap<string, CatalogExercise>,
  input: GeneratorInput,
) {
  const target = (m: MuscleCode) =>
    input.priorities.has(m)
      ? 17
      : m === 'calves' || m === 'abs'
        ? 0
        : VOLUME_LANDMARKS.productiveMin;
  for (let guard = 0; guard < 200; guard++) {
    const vol = weeklyVolume(templates, byId);
    let best: { t: GeneratedTemplate; x: GeneratedExercise; gap: number } | null = null;
    for (const t of templates) {
      const fits = estimateMinutes(t.exercises) + 3.5 <= input.minutesPerSession;
      if (!fits) continue;
      for (const x of t.exercises) {
        const m = byId.get(x.exerciseId)?.primaryMuscles[0];
        if (!m || x.sets >= 5) continue;
        const gap = target(m) - (vol.get(m) ?? 0);
        if (gap > 0 && (!best || gap > best.gap)) best = { t, x, gap };
      }
    }
    if (!best) break;
    best.x.sets += 1;
  }
  for (let guard = 0; guard < 200; guard++) {
    const vol = weeklyVolume(templates, byId);
    const over = [...vol.entries()].find(([, v]) => v > VOLUME_LANDMARKS.mrv);
    if (!over) break;
    const victim = templates
      .flatMap((t) => t.exercises)
      .filter((x) => byId.get(x.exerciseId)?.primaryMuscles[0] === over[0] && x.sets > 2)
      .sort((a, b) => b.sets - a.sets)[0];
    if (!victim) break;
    victim.sets -= 1;
  }
}
