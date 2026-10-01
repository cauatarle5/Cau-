import { groundedNumbers } from '@atlas/core';

import type { CoachTransport } from '../coach/coach';
import { WEEKLY_SUMMARY_SYSTEM } from '../prompts/weekly-summary';

export interface WeeklySummaryData {
  weekStart: string;
  weekEnd: string;
  summary: {
    training: { sessions: number; adherencePct: number | null; tonnage: number };
    nutrition: { completeDays: number; avgKcal: number | null; avgProteinG: number | null };
    body: { changeKg: number | null; endTrendKg: number | null };
    recovery: { avgSleepHours: number | null; avgReadiness: number | null };
  };
  insights: { title: string; body: string }[];
}

const nf = (v: number, d = 0) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(v);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Resumo por modelo de texto, sem LLM (ADR-056). */
export function templateWeeklySummary(d: WeeklySummaryData): string {
  const { training: t, nutrition: n, body: b, recovery: r } = d.summary;
  const parts = [`Na semana de ${ddmm(d.weekStart)} a ${ddmm(d.weekEnd)}:`];
  parts.push(
    t.sessions > 0
      ? `${nf(t.sessions)} treino(s)${t.adherencePct !== null ? `, ${nf(t.adherencePct)}% dos agendados` : ''}.`
      : 'nenhum treino registrado.',
  );
  parts.push(
    n.completeDays > 0 && n.avgKcal !== null
      ? `Alimentação: ${nf(n.completeDays)} dia(s) completos, média de ${nf(n.avgKcal)} kcal${n.avgProteinG !== null ? ` e ${nf(n.avgProteinG)} g de proteína` : ''}.`
      : 'Registre ao menos 3 refeições por dia para ver suas médias.',
  );
  if (b.changeKg !== null)
    parts.push(
      `Tendência de peso ${b.changeKg < 0 ? 'caiu' : b.changeKg > 0 ? 'subiu' : 'ficou estável'}${b.changeKg !== 0 ? ` ${nf(Math.abs(b.changeKg), 1)} kg` : ''}.`,
    );
  else parts.push('Pese-se algumas vezes na semana para acompanhar a tendência.');
  if (r.avgSleepHours !== null) parts.push(`Sono médio de ${nf(r.avgSleepHours, 1)} h.`);
  const top = d.insights[0];
  if (top) parts.push(`Destaque: ${top.title.toLowerCase()}.`);
  return parts.join(' ');
}

/**
 * Resumo semanal: o LLM redige a partir dos dados; o texto só vale se todos os números estiverem
 * ancorados neles. Sem transporte, com erro ou com número solto: modelo de texto (ADR-056).
 */
export async function writeWeeklySummary(params: {
  data: WeeklySummaryData;
  transport: CoachTransport | null;
  model: string | null;
  onError?: (err: unknown) => void;
}): Promise<{ text: string; source: 'ai' | 'template'; model: string | null }> {
  const fallback = {
    text: templateWeeklySummary(params.data),
    source: 'template' as const,
    model: null,
  };
  if (!params.transport || !params.model) return fallback;
  try {
    const message = await params.transport(
      {
        model: params.model,
        max_tokens: 2000,
        system: WEEKLY_SUMMARY_SYSTEM,
        messages: [{ role: 'user', content: `Dados da semana:\n${JSON.stringify(params.data)}` }],
      },
      () => undefined,
    );
    if (message.stop_reason !== 'end_turn') return fallback;
    const text = message.content
      .flatMap((b) => (b.type === 'text' ? [b.text] : []))
      .join('')
      .trim();
    if (!text || !groundedNumbers(text, [params.data]).ok) return fallback;
    return { text, source: 'ai', model: params.model };
  } catch (err) {
    params.onError?.(err);
    return fallback;
  }
}
