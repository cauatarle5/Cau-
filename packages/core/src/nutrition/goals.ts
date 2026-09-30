import { KCAL_PER_KG, type PrimaryGoal, type TrainingExperience } from './types';

/**
 * Ajuste sobre o GET por objetivo (PROMPT_MESTRE 5.4). Onde a especificação dá faixa,
 * usa-se: fat_loss −20% (valor padrão), recomposition −5%, performance 0% (ADR-021).
 */
export function goalEnergyPct(goal: PrimaryGoal, experience: TrainingExperience): number {
  switch (goal) {
    case 'fat_loss':
      return -0.2;
    case 'maintenance':
      return 0;
    case 'muscle_gain':
      return experience === 'beginner' ? 0.1 : 0.05;
    case 'recomposition':
      return -0.05;
    case 'performance':
      return 0;
  }
}

export interface EnergyAdjustment {
  source: 'goal' | 'rate';
  pct: number;
  kcalDelta: number;
}

/**
 * Com `targetRatePctPerWeek` (com sinal: negativo = perder), o ajuste vem do ritmo:
 * peso × taxa × 7700 / 7. Caso contrário, do percentual do objetivo.
 */
export function energyAdjustment(params: {
  goal: PrimaryGoal;
  experience: TrainingExperience;
  tdeeKcal: number;
  weightKg: number;
  targetRatePctPerWeek?: number | null;
}): EnergyAdjustment {
  const { goal, experience, tdeeKcal, weightKg, targetRatePctPerWeek } = params;
  if (targetRatePctPerWeek !== undefined && targetRatePctPerWeek !== null) {
    const kcalDelta = (weightKg * (targetRatePctPerWeek / 100) * KCAL_PER_KG) / 7;
    return { source: 'rate', pct: kcalDelta / tdeeKcal, kcalDelta };
  }
  const pct = goalEnergyPct(goal, experience);
  return { source: 'goal', pct, kcalDelta: tdeeKcal * pct };
}
