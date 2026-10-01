import { daysBetween } from '../body/age';
import type { TrendPoint } from '../body/weight-trend';

import { KCAL_PER_KG } from './types';

export type EnergyConfidence = 'low' | 'medium' | 'high';

/** Critérios do GET adaptativo (P5.3, ADR-051). */
export const ADAPTIVE_RULES = {
  windowDays: 28,
  medium: { loggedDays: 14, weighIns: 10, weight: 0.7 },
  high: { loggedDays: 21, weighIns: 18, weight: 0.85 },
  /** Variação máxima do GET usado por semana. */
  maxWeeklyChangeKcal: 150,
  /** Refeições registradas para o dia contar como completo. */
  completeDayMeals: 3,
} as const;

export interface AdaptiveDay {
  date: string;
  kcal: number;
  /** Refeições registradas no dia. */
  loggedMeals: number;
}

export interface AdaptiveInput {
  /** Dias da janela (até 28) com o consumido. */
  days: readonly AdaptiveDay[];
  /** Pontos de tendência dos dias com pesagem dentro da janela (tendência calculada no histórico todo). */
  trend: readonly TrendPoint[];
  tdeeFormula: number;
  /** Último GET usado; `null` sem estimativa anterior (usa a fórmula). */
  previousTdee: number | null;
}

export interface EnergyEstimate {
  tdeeFormula: number;
  tdeeObserved: number | null;
  tdeeUsed: number;
  confidence: EnergyConfidence;
  /** Δ tendência na janela (kg). */
  weightTrendKg: number | null;
  intakeAvgKcal: number | null;
  loggedDays: number;
  weighInCount: number;
}

export const isCompleteDay = (d: Pick<AdaptiveDay, 'loggedMeals'>) =>
  d.loggedMeals >= ADAPTIVE_RULES.completeDayMeals;

/**
 * GET adaptativo (P5.3): GET_obs = ingestão média dos dias completos − Δ tendência × 7700 / dias;
 * mistura com o GET anterior (0,7/0,3 com confiança média, 0,85/0,15 com alta) e limita a
 * ±150 kcal do anterior. Sem os critérios, confiança baixa e o GET da fórmula.
 */
export function adaptiveTdee(input: AdaptiveInput): EnergyEstimate {
  const complete = input.days.filter(isCompleteDay);
  const loggedDays = complete.length;
  const weighInCount = input.trend.length;
  const intakeAvgKcal =
    loggedDays > 0 ? complete.reduce((a, d) => a + d.kcal, 0) / loggedDays : null;
  const first = input.trend[0];
  const last = input.trend.at(-1);
  const span = first && last ? daysBetween(first.date, last.date) : 0;
  const weightTrendKg = first && last && span > 0 ? last.trendKg - first.trendKg : null;
  const tdeeObserved =
    intakeAvgKcal !== null && weightTrendKg !== null
      ? intakeAvgKcal - (weightTrendKg * KCAL_PER_KG) / span
      : null;

  const { medium, high } = ADAPTIVE_RULES;
  const confidence: EnergyConfidence =
    loggedDays >= high.loggedDays && weighInCount >= high.weighIns
      ? 'high'
      : loggedDays >= medium.loggedDays && weighInCount >= medium.weighIns
        ? 'medium'
        : 'low';

  const base = {
    tdeeFormula: Math.round(input.tdeeFormula),
    tdeeObserved: tdeeObserved === null ? null : Math.round(tdeeObserved),
    weightTrendKg: weightTrendKg === null ? null : Math.round(weightTrendKg * 1000) / 1000,
    intakeAvgKcal: intakeAvgKcal === null ? null : Math.round(intakeAvgKcal),
    loggedDays,
    weighInCount,
  };
  if (confidence === 'low' || tdeeObserved === null) {
    return { ...base, confidence: 'low', tdeeUsed: Math.round(input.tdeeFormula) };
  }
  const prior = input.previousTdee ?? input.tdeeFormula;
  const w = confidence === 'high' ? high.weight : medium.weight;
  const blended = w * tdeeObserved + (1 - w) * prior;
  const cap = ADAPTIVE_RULES.maxWeeklyChangeKcal;
  const tdeeUsed = Math.round(Math.min(prior + cap, Math.max(prior - cap, blended)));
  return { ...base, confidence, tdeeUsed };
}
