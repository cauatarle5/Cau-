export interface CheckinInput {
  sleepHours: number | null;
  /** 1–5 */
  sleepQuality: number;
  energy: number;
  stress: number;
  fatigue: number;
  soreness: number;
}

export type ReadinessBand = 'green' | 'yellow' | 'red' | 'unknown';
export type ReadinessDriver =
  'sleep' | 'energy' | 'fatigue' | 'soreness' | 'stress' | 'high_acwr' | 'sport_yesterday';

export interface Readiness {
  score: number | null;
  band: ReadinessBand;
  /** Fatores que mais puxaram para baixo, do pior para o melhor. */
  drivers: ReadinessDriver[];
}

export const READINESS_WEIGHTS = {
  sleep: 0.3,
  energy: 0.2,
  fatigue: 0.2,
  soreness: 0.15,
  stress: 0.15,
} as const;

export function readinessBand(score: number | null): ReadinessBand {
  if (score === null) return 'unknown';
  if (score >= 70) return 'green';
  if (score >= 50) return 'yellow';
  return 'red';
}

/**
 * Prontidão 0–100 (P8.5): sono 30% (horas/meta × 0,6 + qualidade × 0,4), disposição 20%,
 * fadiga 20%, dor muscular 15%, estresse 15%; −10 com ACWR > 1,5; −10 com atividade de
 * alta demanda de pernas e RPE ≥ 7 nas últimas 24 h, só para sessão com pernas.
 */
export function readiness(
  checkin: CheckinInput | null,
  opts: {
    sleepGoalHours?: number;
    acwr?: number | null;
    hardLowerBodyActivity24h?: boolean;
    lowerBodySession?: boolean;
  } = {},
): Readiness {
  if (!checkin) return { score: null, band: 'unknown', drivers: [] };
  const goal = opts.sleepGoalHours ?? 8;
  const quality = (checkin.sleepQuality - 1) / 4;
  const sleep =
    checkin.sleepHours === null
      ? quality
      : Math.min(checkin.sleepHours / goal, 1) * 0.6 + quality * 0.4;
  const parts = {
    sleep,
    energy: (checkin.energy - 1) / 4,
    fatigue: (5 - checkin.fatigue) / 4,
    soreness: (5 - checkin.soreness) / 4,
    stress: (5 - checkin.stress) / 4,
  };
  let score =
    100 *
    (READINESS_WEIGHTS.sleep * parts.sleep +
      READINESS_WEIGHTS.energy * parts.energy +
      READINESS_WEIGHTS.fatigue * parts.fatigue +
      READINESS_WEIGHTS.soreness * parts.soreness +
      READINESS_WEIGHTS.stress * parts.stress);
  const drivers: ReadinessDriver[] = (Object.entries(parts) as [ReadinessDriver, number][])
    .filter(([, v]) => v < 0.5)
    .sort((a, b) => a[1] - b[1])
    .map(([k]) => k);
  if (opts.acwr != null && opts.acwr > 1.5) {
    score -= 10;
    drivers.push('high_acwr');
  }
  if (opts.hardLowerBodyActivity24h && opts.lowerBodySession) {
    score -= 10;
    drivers.push('sport_yesterday');
  }
  const final = Math.round(Math.min(100, Math.max(0, score)));
  return { score: final, band: readinessBand(final), drivers };
}
