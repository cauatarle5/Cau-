import { estimateE1rm, tonnage, type SetLike } from './metrics';

export type RecordType = 'e1rm' | 'max_load' | 'rep_at_load' | 'volume_session';

export interface RecordHit {
  type: RecordType;
  value: number;
  reps: number | null;
  loadKg: number | null;
}

/**
 * Recordes de uma série contra o histórico do exercício (P8.1): e1RM, maior carga e
 * mais reps numa carga (≥ a carga). Só séries working concluídas; histórico vazio
 * não gera recorde (primeira exposição é referência, não recorde).
 */
export function detectSetRecords(set: SetLike, history: readonly SetLike[]): RecordHit[] {
  const done = history.filter(
    (s) => s.completed && s.setType === 'working' && s.loadKg !== null && s.reps !== null,
  );
  if (
    done.length === 0 ||
    !set.completed ||
    set.setType !== 'working' ||
    set.loadKg === null ||
    set.reps === null
  ) {
    return [];
  }
  const hits: RecordHit[] = [];
  const e1rm = estimateE1rm(set);
  const prevE1rm = Math.max(0, ...done.map((s) => estimateE1rm(s) ?? 0));
  if (e1rm !== null && e1rm > prevE1rm)
    hits.push({ type: 'e1rm', value: e1rm, reps: set.reps, loadKg: set.loadKg });
  const prevMaxLoad = Math.max(...done.map((s) => s.loadKg ?? 0));
  if (set.loadKg > prevMaxLoad)
    hits.push({ type: 'max_load', value: set.loadKg, reps: set.reps, loadKg: set.loadKg });
  const atLoad = done.filter((s) => (s.loadKg ?? 0) >= set.loadKg!);
  if (atLoad.length > 0) {
    const prevReps = Math.max(...atLoad.map((s) => s.reps ?? 0));
    if (set.reps > prevReps)
      hits.push({ type: 'rep_at_load', value: set.reps, reps: set.reps, loadKg: set.loadKg });
  }
  return hits;
}

/** Recorde de tonelagem da sessão para um exercício. */
export function detectSessionVolumeRecord(
  sessionSets: readonly SetLike[],
  previousSessions: readonly (readonly SetLike[])[],
): RecordHit | null {
  const current = tonnage(sessionSets);
  if (previousSessions.length === 0 || current <= 0) return null;
  const best = Math.max(...previousSessions.map(tonnage));
  return current > best
    ? { type: 'volume_session', value: current, reps: null, loadKg: null }
    : null;
}
