export type ContextFlag = 'LOW_PROTEIN_TODAY' | 'SPORT_YESTERDAY' | 'POOR_SLEEP' | 'HIGH_ACWR';

export interface FlagInput {
  /** Proteína consumida + planejada no dia e a meta (null sem meta). */
  proteinProjectedG: number;
  proteinTargetG: number | null;
  /** Há alguma refeição registrada ou planejada no dia. */
  hasMeals: boolean;
  sportYesterday: boolean;
  sleepHours: number | null;
  sleepQuality: number | null;
  acwr: number | null;
}

/**
 * Sinais do dia (P9): proteína prevista (consumido + planejado) < 80% da meta com refeições
 * no dia; esporte registrado ontem; sono < 6 h ou qualidade ≤ 2; ACWR > 1,5.
 */
export function contextFlags(i: FlagInput): ContextFlag[] {
  const flags: ContextFlag[] = [];
  if (i.hasMeals && i.proteinTargetG !== null && i.proteinProjectedG < 0.8 * i.proteinTargetG)
    flags.push('LOW_PROTEIN_TODAY');
  if (i.sportYesterday) flags.push('SPORT_YESTERDAY');
  if (
    (i.sleepHours !== null && i.sleepHours < 6) ||
    (i.sleepQuality !== null && i.sleepQuality <= 2)
  )
    flags.push('POOR_SLEEP');
  if (i.acwr !== null && i.acwr > 1.5) flags.push('HIGH_ACWR');
  return flags;
}
