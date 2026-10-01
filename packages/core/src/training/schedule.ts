import { addDays } from '../body/dates';

export interface ScheduleTemplate {
  id: string;
  /** Sessão com pernas (quadríceps, posteriores ou glúteos como primários). */
  lower: boolean;
}

const near = (a: number, b: number) => {
  const d = Math.abs(a - b) % 7;
  return Math.min(d, 7 - d) <= 1;
};

/**
 * Distribui os templates nos dias de academia (0 = domingo), em ordem e em ciclo; sessões
 * com pernas trocam de lugar com sessões sem pernas para fugir de dias vizinhos aos esportes
 * fixos quando possível (P8.7.1, ADR-043).
 */
export function scheduleWeek(
  templates: readonly ScheduleTemplate[],
  gymDays: readonly number[],
  sportDays: readonly number[] = [],
): { templateId: string; weekday: number }[] {
  if (templates.length === 0 || gymDays.length === 0) return [];
  const days = [...new Set(gymDays)].sort((a, b) => a - b);
  const slots = days.map((weekday, i) => {
    const t = templates[i % templates.length] as ScheduleTemplate;
    return { weekday, template: t };
  });
  const conflict = (weekday: number) => sportDays.some((s) => near(s, weekday));
  for (const slot of slots) {
    if (!slot.template.lower || !conflict(slot.weekday)) continue;
    const swap = slots.find((o) => !o.template.lower && !conflict(o.weekday));
    if (swap) [slot.template, swap.template] = [swap.template, slot.template];
  }
  return slots.map((s) => ({ templateId: s.template.id, weekday: s.weekday }));
}

/** Datas da agenda: a partir de `start` (inclusive), `weeks` semanas da distribuição semanal. */
export function planDates(
  start: string,
  weeks: number,
  week: readonly { templateId: string; weekday: number }[],
): { date: string; templateId: string; weekIndex: number }[] {
  const out: { date: string; templateId: string; weekIndex: number }[] = [];
  const startDow = new Date(`${start}T00:00:00Z`).getUTCDay();
  for (let w = 0; w < weeks; w++) {
    for (const slot of week) {
      const offset = ((slot.weekday - startDow + 7) % 7) + w * 7;
      out.push({ date: addDays(start, offset), templateId: slot.templateId, weekIndex: w });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
