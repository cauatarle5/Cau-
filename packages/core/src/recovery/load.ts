import { addDays, dateRange } from '../body/dates';

/** Carga da sessão (sRPE, P8.5): RPE × minutos, em UA. */
export function sessionLoad(rpe: number | null, minutes: number | null): number {
  if (rpe === null || minutes === null || rpe <= 0 || minutes <= 0) return 0;
  return rpe * minutes;
}

export interface LoadSnapshot {
  date: string;
  dayAU: number;
  /** Soma dos últimos 7 dias (incluindo o dia). */
  acute7d: number;
  /** EWMA diária (N = 28) × 7: equivalente semanal da carga crônica (ADR-044). */
  chronic28d: number;
  acwr: number | null;
  /** Média diária / desvio padrão diário dos últimos 7 dias (Foster). */
  monotony7d: number | null;
  strain7d: number | null;
}

const ALPHA = 2 / (28 + 1);

/**
 * Série diária de carga interna de `from` a `to` (P8.5). `entries` são cargas por dia
 * (sessões e atividades); o histórico anterior a `from` alimenta a EWMA.
 */
export function loadSeries(
  entries: readonly { date: string; au: number }[],
  from: string,
  to: string,
): LoadSnapshot[] {
  const byDay = new Map<string, number>();
  for (const e of entries) byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.au);
  const first = [...byDay.keys()].sort()[0];
  const start = first && first < from ? first : from;
  const days = dateRange(start, to);
  const out: LoadSnapshot[] = [];
  // Começa em zero: usuário novo não ganha carga crônica alta com o primeiro treino.
  let ewma = 0;
  const window: number[] = [];
  // ACWR só com histórico que cubra a janela crônica (28 dias desde a primeira carga).
  const enoughFrom = first ? addDays(first, 27) : null;
  for (const date of days) {
    const au = byDay.get(date) ?? 0;
    ewma = ALPHA * au + (1 - ALPHA) * ewma;
    window.push(au);
    if (window.length > 7) window.shift();
    if (date < from) continue;
    const acute = window.reduce((a, b) => a + b, 0);
    const chronic = ewma * 7;
    const mean = acute / 7;
    const padded = [...Array<number>(7 - window.length).fill(0), ...window];
    const sd = Math.sqrt(padded.reduce((a, v) => a + (v - mean) ** 2, 0) / 7);
    const monotony = sd > 0 ? mean / sd : null;
    out.push({
      date,
      dayAU: au,
      acute7d: acute,
      chronic28d: chronic,
      acwr: chronic > 0 && enoughFrom !== null && date >= enoughFrom ? acute / chronic : null,
      monotony7d: monotony,
      strain7d: monotony === null ? null : acute * monotony,
    });
  }
  return out;
}

/** Dia anterior (para regras "nas últimas 24 h"). */
export const previousDay = (date: string) => addDays(date, -1);
