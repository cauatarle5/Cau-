import { estimateMinutes, type CatalogExercise } from './generator';
import { muscleVolume, volumeStatus, type MuscleCode } from './volume';

export interface ValidationTemplate {
  name: string;
  exercises: { exercise: CatalogExercise; sets: number; restSeconds: number | null }[];
}

export interface ProgramWarning {
  code: 'VOLUME_LOW' | 'VOLUME_HIGH' | 'SESSION_TOO_LONG' | 'CONTRAINDICATED' | 'LEGS_NEAR_SPORT';
  message: string;
  muscle?: MuscleCode;
  template?: string;
}

const LOWER: readonly MuscleCode[] = ['quads', 'hamstrings', 'glutes'];

export const isLowerSession = (t: ValidationTemplate) =>
  t.exercises.some((x) => x.exercise.primaryMuscles.some((m) => LOWER.includes(m)));

/**
 * Validador de programa (P8.7.7): volume semanal por músculo (MEV/MRV), tempo por sessão,
 * exercícios contraindicados pelas limitações e sessões de pernas vizinhas a esportes. Gera
 * avisos, não erros.
 */
export function validateProgram(input: {
  templates: readonly ValidationTemplate[];
  minutesPerSession: number | null;
  contraindicated: ReadonlySet<string>;
  priorities: ReadonlySet<string>;
  muscleNames: ReadonlyMap<string, string>;
  /** Distribuição semanal (template → dia) e dias de esporte, quando houver agenda. */
  schedule?: { template: string; weekday: number }[];
  sportDays?: readonly number[];
}): ProgramWarning[] {
  const warnings: ProgramWarning[] = [];
  const vol = new Map(
    muscleVolume(
      input.templates.flatMap((t) =>
        t.exercises.map((x) => ({
          date: t.name,
          muscles: [
            ...x.exercise.primaryMuscles.map((m) => ({ muscle: m, weight: 1 })),
            ...x.exercise.secondaryMuscles.map((m) => ({ muscle: m, weight: 0.5 })),
          ],
          sets: Array.from({ length: x.sets }, () => ({
            setType: 'working' as const,
            reps: 8,
            loadKg: null,
            rir: 2,
            rpe: null,
            completed: true,
          })),
        })),
      ),
    ).map((v) => [v.muscle, v.hardSets]),
  );
  const main: MuscleCode[] = [
    'chest',
    'lats',
    'upper_back',
    'quads',
    'hamstrings',
    'glutes',
    'side_delts',
  ];
  for (const m of main) {
    const sets = vol.get(m) ?? 0;
    const { status } = volumeStatus(m, sets, { priority: input.priorities.has(m) });
    const name = input.muscleNames.get(m) ?? m;
    if (status === 'below_mev') {
      warnings.push({
        code: 'VOLUME_LOW',
        muscle: m,
        message: `${name}: ${fmt(sets)} séries duras por semana, abaixo do mínimo efetivo (8).`,
      });
    }
  }
  for (const [m, sets] of vol) {
    if (volumeStatus(m, sets).status === 'above_mrv') {
      warnings.push({
        code: 'VOLUME_HIGH',
        muscle: m,
        message: `${input.muscleNames.get(m) ?? m}: ${fmt(sets)} séries duras por semana, acima do máximo recuperável (22).`,
      });
    }
  }
  for (const t of input.templates) {
    const minutes = estimateMinutes(
      t.exercises.map((x) => ({ sets: x.sets, restSeconds: x.restSeconds ?? 120 })),
    );
    if (input.minutesPerSession && minutes > input.minutesPerSession * 1.1) {
      warnings.push({
        code: 'SESSION_TOO_LONG',
        template: t.name,
        message: `${t.name}: cerca de ${String(Math.round(minutes))} min, acima dos ${String(input.minutesPerSession)} min disponíveis.`,
      });
    }
    for (const x of t.exercises) {
      const hit = [...x.exercise.contraindicationTags, x.exercise.movementPattern].some((tag) =>
        input.contraindicated.has(tag),
      );
      if (hit) {
        warnings.push({
          code: 'CONTRAINDICATED',
          template: t.name,
          message: `${t.name}: ${x.exercise.name} conflita com uma limitação registrada.`,
        });
      }
    }
  }
  if (input.schedule && input.sportDays && input.sportDays.length > 0) {
    const sport = input.sportDays;
    for (const s of input.schedule) {
      const t = input.templates.find((x) => x.name === s.template);
      if (!t || !isLowerSession(t)) continue;
      if (
        sport.some((d) => d === s.weekday || (d + 1) % 7 === s.weekday || (s.weekday + 1) % 7 === d)
      ) {
        warnings.push({
          code: 'LEGS_NEAR_SPORT',
          template: t.name,
          message: `${t.name}: sessão de pernas no dia de um esporte ou vizinho a ele.`,
        });
      }
    }
  }
  return warnings;
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','));
