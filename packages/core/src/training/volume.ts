import { isHardSet, type SetLike } from './metrics';

export type MuscleCode =
  | 'chest'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'lats'
  | 'upper_back'
  | 'traps'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'obliques'
  | 'lower_back'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'adductors'
  | 'abductors'
  | 'calves';

export interface ExerciseMuscle {
  muscle: MuscleCode;
  /** 1,0 primário; 0,5 secundário. */
  weight: number;
}

export interface PerformedExercise {
  /** Dia do usuário (YYYY-MM-DD). */
  date: string;
  muscles: readonly ExerciseMuscle[];
  sets: readonly SetLike[];
}

export interface MuscleVolume {
  muscle: MuscleCode;
  /** Séries duras ponderadas na semana. */
  hardSets: number;
  /** Dias com ≥ 2 séries duras ponderadas. */
  frequency: number;
}

/**
 * Volume por músculo = Σ séries duras × peso do músculo; frequência = dias com
 * ≥ 2 séries duras ponderadas (P8.1). Espera exercícios de uma mesma semana.
 */
export function muscleVolume(exercises: readonly PerformedExercise[]): MuscleVolume[] {
  const total = new Map<MuscleCode, number>();
  const perDay = new Map<string, number>();
  for (const ex of exercises) {
    const hard = ex.sets.filter(isHardSet).length;
    if (hard === 0) continue;
    for (const m of ex.muscles) {
      const weighted = hard * m.weight;
      total.set(m.muscle, (total.get(m.muscle) ?? 0) + weighted);
      const key = `${m.muscle}|${ex.date}`;
      perDay.set(key, (perDay.get(key) ?? 0) + weighted);
    }
  }
  return [...total.entries()]
    .map(([muscle, hardSets]) => ({
      muscle,
      hardSets,
      frequency: [...perDay.entries()].filter(([k, v]) => k.startsWith(`${muscle}|`) && v >= 2)
        .length,
    }))
    .sort((a, b) => b.hardSets - a.hardSets);
}

/** Faixas de séries duras por semana (P8.2). */
export const VOLUME_LANDMARKS = { mev: 8, productiveMin: 10, productiveMax: 20, mrv: 22 } as const;

export type VolumeStatus = 'below_mev' | 'minimum' | 'productive' | 'high' | 'above_mrv';

/** Situação do volume semanal; panturrilha e abdômen abaixo do MEV não alertam, salvo prioridade. */
export function volumeStatus(
  muscle: MuscleCode,
  hardSets: number,
  opts: { priority?: boolean } = {},
): { status: VolumeStatus; alert: boolean } {
  const { mev, productiveMin, productiveMax, mrv } = VOLUME_LANDMARKS;
  let status: VolumeStatus;
  if (hardSets < mev) status = 'below_mev';
  else if (hardSets < productiveMin) status = 'minimum';
  else if (hardSets <= productiveMax) status = 'productive';
  else if (hardSets <= mrv) status = 'high';
  else status = 'above_mrv';
  const exempt = (muscle === 'calves' || muscle === 'abs') && !opts.priority;
  const alert = status === 'above_mrv' || (status === 'below_mev' && !exempt);
  return { status, alert };
}
