import { mean } from '../insights/stats';
import { performanceDrop } from '../training/progression';

/**
 * Desempenho relativo de cada sessão (correlações, P9): tonelagem / média das sessões com o
 * mesmo nome no período × 100. Nomes com uma sessão só ficam de fora.
 */
export function relativePerformance(
  sessions: readonly { date: string; name: string; tonnage: number }[],
): { date: string; index: number }[] {
  const byName = new Map<string, number[]>();
  for (const s of sessions) byName.set(s.name, [...(byName.get(s.name) ?? []), s.tonnage]);
  return sessions.flatMap((s) => {
    const list = byName.get(s.name) ?? [];
    const avg = mean(list) ?? 0;
    return list.length >= 2 && avg > 0 ? [{ date: s.date, index: (s.tonnage / avg) * 100 }] : [];
  });
}

export interface StrengthTrend {
  first: number;
  last: number;
  best: number;
  /** (último − primeiro) / primeiro, em %. */
  changePct: number;
  sessions: number;
  points: { date: string; e1rm: number }[];
  /** Quedas de desempenho (P8.4) a partir de `dropsFrom`. */
  drops: { date: string; e1rm: number; previousMean: number }[];
}

/**
 * Evolução do e1RM de um exercício no período (`from` em diante), com o histórico anterior
 * usado para as quedas (e1RM ≥ 5% abaixo da média das 3 exposições anteriores).
 */
export function strengthTrend(
  all: readonly { date: string; e1rm: number }[],
  from: string,
  dropsFrom: string,
): StrengthTrend | null {
  const points = all.filter((p) => p.date >= from);
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return null;
  const drops: StrengthTrend['drops'] = [];
  all.forEach((p, i) => {
    if (p.date < dropsFrom) return;
    const previous = all.slice(Math.max(0, i - 3), i).map((x) => x.e1rm);
    if (performanceDrop(p.e1rm, previous)) {
      drops.push({ date: p.date, e1rm: p.e1rm, previousMean: mean(previous) ?? 0 });
    }
  });
  return {
    first: first.e1rm,
    last: last.e1rm,
    best: Math.max(...points.map((p) => p.e1rm)),
    changePct: ((last.e1rm - first.e1rm) / first.e1rm) * 100,
    sessions: points.length,
    points,
    drops,
  };
}

/** Média semanal de um total num período de `days` dias (mínimo de 1 semana), 1 casa. */
export const perWeek = (total: number, days: number) =>
  Math.round((total / Math.max(1, days / 7)) * 10) / 10;

/** Completude do registro do dia: refeições registradas / 3, até 1 (ADR-051). */
export const logCompleteness = (loggedMeals: number) => Math.min(1, loggedMeals / 3);
