import { daysBetween } from './age';

export interface WeighIn {
  date: string;
  weightKg: number;
}

export interface TrendPoint {
  date: string;
  /** Média das pesagens do dia (ADR-018). */
  weightKg: number;
  trendKg: number;
}

/** Fator de suavização da média móvel exponencial (PROMPT_MESTRE 5.5). */
export const TREND_ALPHA = 0.1;

/** Agrupa pesagens por dia (média) em ordem cronológica. */
export function dailyWeights(entries: readonly WeighIn[]): WeighIn[] {
  const byDay = new Map<string, { sum: number; n: number }>();
  for (const { date, weightKg } of entries) {
    const acc = byDay.get(date) ?? { sum: 0, n: 0 };
    acc.sum += weightKg;
    acc.n += 1;
    byDay.set(date, acc);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, { sum, n }]) => ({ date, weightKg: sum / n }));
}

/**
 * Tendência: t = t₋₁ + 0,1 × (peso − t₋₁), começando no primeiro peso.
 * Dias sem pesagem não geram ponto (tendência mantida, sem interpolação).
 */
export function weightTrend(entries: readonly WeighIn[]): TrendPoint[] {
  const points: TrendPoint[] = [];
  let trend: number | undefined;
  for (const day of dailyWeights(entries)) {
    trend = trend === undefined ? day.weightKg : trend + TREND_ALPHA * (day.weightKg - trend);
    points.push({ date: day.date, weightKg: day.weightKg, trendKg: trend });
  }
  return points;
}

/** Última tendência conhecida, ou `null` sem pesagens. */
export function latestTrend(entries: readonly WeighIn[]): TrendPoint | null {
  return weightTrend(entries).at(-1) ?? null;
}

/** Variação por dia acima da qual pedimos confirmação (ADR-018). */
export const UNUSUAL_DAILY_CHANGE = 0.02;

/** `true` se a nova pesagem se afasta da tendência mais de 2% por dia decorrido. */
export function isUnusualWeightChange(previous: TrendPoint, next: WeighIn): boolean {
  const days = Math.max(1, daysBetween(previous.date, next.date));
  return (
    Math.abs(next.weightKg - previous.trendKg) / previous.trendKg / days > UNUSUAL_DAILY_CHANGE
  );
}
