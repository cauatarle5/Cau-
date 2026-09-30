export type SetType = 'warmup' | 'working' | 'drop' | 'failure' | 'backoff';

export interface SetLike {
  setType: SetType;
  reps: number | null;
  loadKg: number | null;
  rir: number | null;
  rpe: number | null;
  completed: boolean;
}

/** RIR = 10 − RPE (P4.3). */
export function rirFromRpe(rpe: number): number {
  return 10 - rpe;
}

/** RIR informado, ou derivado do RPE; `null` sem nenhum dos dois. */
export function effectiveRir(set: Pick<SetLike, 'rir' | 'rpe'>): number | null {
  if (set.rir !== null) return set.rir;
  if (set.rpe !== null) return rirFromRpe(set.rpe);
  return null;
}

const countsAsWorking = (s: SetLike) => s.completed && s.setType === 'working';

/**
 * e1RM de Epley: carga × (1 + reps/30), só para séries working com 1 a 12 repetições.
 * Com RIR, usa reps efetivas = reps + RIR, limitado a 12 (P8.1).
 */
export function estimateE1rm(set: SetLike): number | null {
  if (!countsAsWorking(set) || set.reps === null || set.loadKg === null || set.loadKg <= 0)
    return null;
  if (set.reps < 1 || set.reps > 12) return null;
  const rir = effectiveRir(set) ?? 0;
  const reps = Math.min(12, set.reps + Math.max(0, rir));
  return set.loadKg * (1 + reps / 30);
}

/** Tonelagem: Σ carga × reps das séries working (P8.1). */
export function tonnage(sets: readonly SetLike[]): number {
  return sets.filter(countsAsWorking).reduce((acc, s) => acc + (s.loadKg ?? 0) * (s.reps ?? 0), 0);
}

/** Série dura: working com RIR ≤ 3 (ou RPE ≥ 7); sem RIR/RPE conta como dura (P8.1). */
export function isHardSet(set: SetLike): boolean {
  if (!countsAsWorking(set)) return false;
  const rir = effectiveRir(set);
  return rir === null || rir <= 3;
}

/** Melhor e1RM de um conjunto de séries. */
export function bestE1rm(sets: readonly SetLike[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    const e = estimateE1rm(s);
    if (e !== null && (best === null || e > best)) best = e;
  }
  return best;
}

export interface ExerciseSessionStats {
  bestE1rm: number | null;
  topLoadKg: number | null;
  tonnage: number;
  workingSets: number;
  hardSets: number;
}

/** Resumo de um exercício numa sessão (progresso por exercício). */
export function sessionStats(sets: readonly SetLike[]): ExerciseSessionStats {
  const working = sets.filter(countsAsWorking);
  const loads = working.flatMap((s) => (s.loadKg === null ? [] : [s.loadKg]));
  return {
    bestE1rm: bestE1rm(sets),
    topLoadKg: loads.length > 0 ? Math.max(...loads) : null,
    tonnage: tonnage(sets),
    workingSets: working.length,
    hardSets: sets.filter(isHardSet).length,
  };
}
