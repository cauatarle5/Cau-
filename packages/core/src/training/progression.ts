import { bestE1rm, type SetLike } from './metrics';

export interface Exposure {
  date: string;
  sets: readonly SetLike[];
  /** Sessão adaptada por baixa prontidão: não conta para a progressão (P8.3.4). */
  adapted: boolean;
}

export interface ProgressionPlan {
  repMin: number;
  repMax: number;
  targetRir: number | null;
  incrementKg: number;
}

export interface SetTarget {
  action: 'increase' | 'keep' | 'decrease' | 'none';
  loadKg: number | null;
  repMin: number;
  repMax: number;
}

const working = (sets: readonly SetLike[]) =>
  sets.filter((s) => s.completed && s.setType === 'working' && s.reps !== null);

const floorTo = (v: number, step: number) => (step > 0 ? Math.floor(v / step + 1e-9) * step : v);

/**
 * Progressão dupla (P8.3): todas as séries no topo da faixa com RIR ≥ alvo − 1 → +incremento
 * e reps voltam ao mínimo; abaixo do mínimo em 2 exposições seguidas → −7,5% (arredondado ao
 * incremento, ficando entre 5% e 10% quando possível); senão mantém a carga e busca +1 rep.
 */
export function nextTarget(exposures: readonly Exposure[], plan: ProgressionPlan): SetTarget {
  const valid = exposures.filter((e) => !e.adapted && working(e.sets).length > 0);
  const last = valid.at(-1);
  if (!last) return { action: 'none', loadKg: null, repMin: plan.repMin, repMax: plan.repMax };
  const sets = working(last.sets);
  const loads = sets.flatMap((s) => (s.loadKg === null ? [] : [s.loadKg]));
  const load = loads.length > 0 ? Math.max(...loads) : null;
  const bestReps = Math.max(...sets.map((s) => s.reps ?? 0));

  const rirOk = (s: SetLike) =>
    plan.targetRir === null || s.rir === null || s.rir >= plan.targetRir - 1;
  if (sets.every((s) => (s.reps ?? 0) >= plan.repMax && rirOk(s))) {
    return {
      action: 'increase',
      loadKg: load === null ? null : load + plan.incrementKg,
      repMin: plan.repMin,
      repMax: plan.repMax,
    };
  }

  const below = (e: Exposure) => Math.max(...working(e.sets).map((s) => s.reps ?? 0)) < plan.repMin;
  const prev = valid.at(-2);
  if (prev && below(last) && below(prev)) {
    const reduced = load === null ? null : floorTo(load * 0.925, plan.incrementKg);
    return {
      action: 'decrease',
      loadKg: reduced !== null && load !== null && reduced >= load ? load * 0.925 : reduced,
      repMin: plan.repMin,
      repMax: plan.repMax,
    };
  }

  return {
    action: 'keep',
    loadKg: load,
    repMin: Math.min(plan.repMax, Math.max(plan.repMin, bestReps + 1)),
    repMax: plan.repMax,
  };
}

/**
 * Estagnado (P8.4): o melhor e1RM das últimas 4 exposições não supera em ≥ 1% o da exposição
 * anterior a elas, ou 21 dias sem novo melhor e1RM.
 */
export function isStagnant(exposures: readonly Exposure[], today: string): boolean {
  const points = exposures
    .map((e) => ({ date: e.date, e1rm: bestE1rm(e.sets) }))
    .filter((p): p is { date: string; e1rm: number } => p.e1rm !== null);
  if (points.length >= 5) {
    const last4 = points.slice(-4);
    const before = points[points.length - 5];
    if (before && Math.max(...last4.map((p) => p.e1rm)) < before.e1rm * 1.01) return true;
  }
  if (points.length >= 2) {
    let bestDate = points[0]?.date ?? today;
    let best = -Infinity;
    for (const p of points) {
      if (p.e1rm > best) {
        best = p.e1rm;
        bestDate = p.date;
      }
    }
    const days =
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${bestDate}T00:00:00Z`)) / 86_400_000;
    if (days >= 21) return true;
  }
  return false;
}

/** Queda de desempenho num exercício (P8.4): e1RM ≥ 5% abaixo da média das 3 exposições anteriores. */
export function performanceDrop(sessionE1rm: number | null, previous: readonly number[]): boolean {
  if (sessionE1rm === null || previous.length < 3) return false;
  const last3 = previous.slice(-3);
  const mean = last3.reduce((a, b) => a + b, 0) / 3;
  return sessionE1rm <= mean * 0.95;
}
