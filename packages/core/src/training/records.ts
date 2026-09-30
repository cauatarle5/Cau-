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
  const load = set.loadKg;
  const atLoad = done.filter((s) => (s.loadKg ?? 0) >= load);
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

/** Série numa linha do tempo de recordes: `id` estável para associar os recordes. */
export interface TimelineSet extends SetLike {
  id: string;
}

export interface TimelineSession {
  id: string;
  /** Só sessões finalizadas entram no recorde de tonelagem. */
  finished: boolean;
  /** Séries já na ordem de execução. */
  sets: readonly TimelineSet[];
}

export interface RecordTimeline {
  bySet: Map<string, RecordHit[]>;
  bySession: Map<string, RecordHit>;
}

const isReference = (s: SetLike) =>
  s.completed && s.setType === 'working' && s.loadKg !== null && s.reps !== null;

/**
 * Recalcula todos os recordes de um exercício a partir do histórico em ordem (P8.1,
 * "recalculável"). Uma série só pode bater recorde se alguma sessão anterior teve série
 * working concluída (primeira exposição é referência); compara com as sessões anteriores e
 * com as séries anteriores da mesma sessão. Tonelagem: só sessões finalizadas, contra as
 * finalizadas anteriores com tonelagem > 0.
 */
export function recordTimeline(sessions: readonly TimelineSession[]): RecordTimeline {
  const bySet = new Map<string, RecordHit[]>();
  const bySession = new Map<string, RecordHit>();
  const previous: SetLike[] = [];
  const previousTonnage: SetLike[][] = [];
  for (const session of sessions) {
    const hasReference = previous.some(isReference);
    const earlier: SetLike[] = [];
    for (const set of session.sets) {
      if (hasReference) {
        const hits = detectSetRecords(set, [...previous, ...earlier]);
        if (hits.length > 0) bySet.set(set.id, hits);
      }
      earlier.push(set);
    }
    if (session.finished) {
      const hit = detectSessionVolumeRecord(
        session.sets,
        previousTonnage.filter((s) => tonnage(s) > 0),
      );
      if (hit) bySession.set(session.id, hit);
      previousTonnage.push([...session.sets]);
    }
    previous.push(...session.sets);
  }
  return { bySet, bySession };
}
