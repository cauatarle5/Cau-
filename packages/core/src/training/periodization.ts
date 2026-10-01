export type MesocyclePhase = 'accumulation' | 'intensification' | 'realization' | 'deload';

/** Mesociclo padrão (P8.7.5): 4 semanas de acumulação + 1 de deload. */
export const DEFAULT_MESOCYCLE = {
  weeks: 5,
  rir: [3, 2, 2, 1, 4],
  volume: [1, 1.1, 1.15, 1.2, 0.5],
} as const;

export const DEFAULT_MESOCYCLE_COUNT = 3;

export interface WeekPlan {
  weekIndex: number;
  rir: number;
  volumeFactor: number;
  deload: boolean;
}

/** RIR e fator de volume da semana (0-based) dentro do mesociclo padrão. */
export function weekPlan(weekIndex: number): WeekPlan {
  const i = Math.min(Math.max(0, weekIndex), DEFAULT_MESOCYCLE.weeks - 1);
  return {
    weekIndex: i,
    rir: DEFAULT_MESOCYCLE.rir[i] ?? 2,
    volumeFactor: DEFAULT_MESOCYCLE.volume[i] ?? 1,
    deload: i === DEFAULT_MESOCYCLE.weeks - 1,
  };
}

/** Séries da semana: base × fator, arredondado, mínimo 1. */
export function periodizedSets(baseSets: number, volumeFactor: number): number {
  return Math.max(1, Math.round(baseSets * volumeFactor));
}
