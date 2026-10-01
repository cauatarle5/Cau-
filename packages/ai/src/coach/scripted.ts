import type Anthropic from '@anthropic-ai/sdk';

import { addDays } from '@atlas/core';

import type { CoachTransport } from './coach';

type Params = Parameters<CoachTransport>[0];
type ToolCall = { name: string; input: Record<string, unknown> };

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const nf = (v: number, d = 1) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(v);

function todayFrom(params: Params): string {
  const sys = Array.isArray(params.system)
    ? params.system.map((b) => b.text).join('\n')
    : (params.system ?? '');
  return /Hoje é (\d{4}-\d{2}-\d{2})/.exec(sys)?.[1] ?? new Date().toISOString().slice(0, 10);
}

const SLOTS: [RegExp, string][] = [
  [/almoco/, 'lunch'],
  [/jantar/, 'dinner'],
  [/cafe da manha|cafe/, 'breakfast'],
  [/lanche/, 'afternoon_snack'],
];

/** Ferramentas por palavras-chave (as 14 perguntas da P10.4 e o registro de refeição). */
export function scriptedToolPlan(question: string, today: string): ToolCall[] {
  const q = norm(question);
  const last = (days: number) => ({ start: addDays(today, -(days - 1)), end: today });
  if (/registr|anota|comi /.test(q) && /\d/.test(q)) {
    const slot = SLOTS.find(([re]) => re.test(q))?.[1] ?? 'other';
    const text = question.includes(':')
      ? question.slice(question.indexOf(':') + 1).trim()
      : question;
    return [{ name: 'propose_meal_log', input: { text, slot } }];
  }
  if (/dormi mal|adaptar/.test(q))
    return [
      { name: 'get_daily_context', input: { date: today } },
      { name: 'propose_workout_adaptation', input: { date: today, reason: 'noite ruim' } },
    ];
  if (/comer hoje|completar|macros/.test(q))
    return [
      { name: 'get_daily_context', input: { date: today } },
      { name: 'suggest_meal', input: { slot: null } },
    ];
  if (/treino devo|treino de hoje|treino hoje/.test(q))
    return [
      { name: 'get_today_plan', input: {} },
      { name: 'get_daily_context', input: { date: today } },
    ];
  if (/maior evolu/.test(q)) return [{ name: 'get_period_summary', input: last(28) }];
  if (/evolu.*trein|trein.*evolu/.test(q))
    return [
      { name: 'get_period_summary', input: last(28) },
      { name: 'get_exercise_progress', input: { exercise: 'supino', ...last(28) } },
    ];
  if (/musculo.*(tras|atras)|ficando para tras/.test(q))
    return [
      { name: 'get_muscle_volume', input: last(28) },
      { name: 'get_exercise_progress', input: { exercise: 'agachamento', ...last(28) } },
    ];
  if (/frequencia|suficiente/.test(q)) return [{ name: 'get_muscle_volume', input: last(28) }];
  if (/proteina/.test(q)) return [{ name: 'get_nutrition_history', input: last(14) }];
  if (/meta calorica|calori/.test(q))
    return [
      { name: 'get_nutrition_history', input: last(14) },
      { name: 'get_body_trend', input: last(28) },
    ];
  if (/peso/.test(q)) return [{ name: 'get_body_trend', input: last(28) }];
  if (/consisten/.test(q)) return [{ name: 'get_period_summary', input: last(28) }];
  if (/padr/.test(q)) return [{ name: 'get_insights', input: { status: null } }];
  if (/semana/.test(q))
    return [
      { name: 'get_period_summary', input: last(7) },
      { name: 'get_insights', input: { status: null } },
    ];
  return [{ name: 'get_period_summary', input: last(7) }];
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Frases com números tirados dos retornos (sempre ancorados, ADR-055). */
export function scriptedAnswer(
  results: { name: string; result: unknown; isError: boolean }[],
): string {
  const out: string[] = [];
  for (const { name, result, isError } of results) {
    if (isError) {
      out.push(`Não consegui consultar ${name.replace(/_/g, ' ')}: ${String(result)}`);
      continue;
    }
    const r = obj(result);
    const period = obj(r.period);
    const range =
      typeof period.start === 'string' && typeof period.end === 'string'
        ? `De ${period.start.slice(8, 10)}/${period.start.slice(5, 7)} a ${period.end.slice(8, 10)}/${period.end.slice(5, 7)}`
        : 'Hoje';
    const s = obj(r.summary);
    const t = obj(s.training);
    const n = obj(r.nutrition ?? s.nutrition);
    const b = obj(r.body ?? s.body);
    if (r.proposalCreated === true)
      out.push(`Preparei a proposta: ${String(r.summary)}. Confira e toque em Aplicar.`);
    if (num(t.sessions) !== null)
      out.push(
        `${range}: **${nf(num(t.sessions) ?? 0, 0)}** treinos${num(t.adherencePct) !== null ? `, aderência de **${nf(num(t.adherencePct) ?? 0, 0)}%**` : ''}.`,
      );
    const ranking = Array.isArray(r.strengthRanking) ? r.strengthRanking.map(obj) : [];
    const top = ranking
      .slice()
      .sort((x, y) => (num(y.changePct) ?? 0) - (num(x.changePct) ?? 0))[0];
    if (top)
      out.push(
        `Maior evolução: ${String(top.name)} (**${nf(num(top.changePct) ?? 0)}%** no e1RM).`,
      );
    if (num(n.avgKcal) !== null)
      out.push(
        `${range}: média de **${nf(num(n.avgKcal) ?? 0, 0)} kcal** e **${nf(num(n.avgProteinG) ?? 0, 0)} g** de proteína nos dias completos.`,
      );
    if (num(b.changeKg) !== null)
      out.push(`Tendência de peso: **${nf(num(b.changeKg) ?? 0)} kg** no período.`);
    const muscles = Array.isArray(r.muscles) ? r.muscles.map(obj) : [];
    const low = muscles
      .slice()
      .sort((x, y) => (num(x.hardSetsPerWeek) ?? 0) - (num(y.hardSetsPerWeek) ?? 0))[0];
    if (low)
      out.push(
        `Menor volume: ${String(low.namePt)} com **${nf(num(low.hardSetsPerWeek) ?? 0)}** séries duras por semana.`,
      );
    if (name === 'get_exercise_progress' && typeof r.exercise === 'string')
      out.push(`${r.exercise}: ${r.stagnant === true ? 'estagnado' : 'progredindo'}.`);
    const items = Array.isArray(r.items) ? r.items.map(obj) : [];
    if (name === 'get_insights' && items[0]) out.push(`Destaque: ${String(items[0].title)}.`);
    const training = obj(r.workout ?? r.training);
    const planned = obj(training.planned);
    if (typeof planned.templateName === 'string')
      out.push(`Treino de hoje: ${planned.templateName}.`);
    const options = Array.isArray(r.options) ? r.options.map(obj) : [];
    if (name === 'suggest_meal')
      out.push(
        options.length > 0
          ? 'Separei sugestões que cabem no restante do dia.'
          : 'Não há sugestão que caiba no restante do dia.',
      );
  }
  return out.length > 0
    ? out.join(' ')
    : 'Não há dados suficientes para responder; registre treinos, refeições e pesagens.';
}

const msg = (content: unknown[], stop: string): Anthropic.Beta.BetaMessage =>
  ({
    id: 'scripted',
    type: 'message',
    role: 'assistant',
    model: 'scripted',
    content,
    stop_reason: stop,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  }) as unknown as Anthropic.Beta.BetaMessage;

/**
 * Transporte roteirizado, sem rede (E2E com `AI_FAKE` e harness da avaliação, ADR-056): escolhe as
 * ferramentas por palavras-chave e responde com os números dos retornos.
 */
export function scriptedTransport(): CoachTransport {
  return (params, onText) => {
    const messages = params.messages;
    const lastMsg = messages.at(-1);
    const content = lastMsg?.content;
    const hasResults = Array.isArray(content) && content.some((c) => obj(c).type === 'tool_result');
    if (!hasResults || params.tool_choice?.type === 'none') {
      const question = typeof content === 'string' ? content : '';
      if (!question) {
        const text = 'Pronto.';
        onText(text);
        return Promise.resolve(msg([{ type: 'text', text, citations: null }], 'end_turn'));
      }
      const plan = scriptedToolPlan(question, todayFrom(params));
      return Promise.resolve(
        msg(
          plan.map((c, i) => ({
            type: 'tool_use',
            id: `call_${String(i)}`,
            name: c.name,
            input: c.input,
          })),
          'tool_use',
        ),
      );
    }
    // Junta os pares tool_use → tool_result da última rodada.
    const prev = messages.at(-2);
    const uses = (Array.isArray(prev?.content) ? prev.content : [])
      .map(obj)
      .filter((c) => c.type === 'tool_use');
    const results = (content as unknown[]).map(obj).map((c) => {
      const use = uses.find((u) => u.id === c.tool_use_id);
      let parsed: unknown = c.content;
      try {
        parsed = JSON.parse(String(c.content));
      } catch {
        // erro em texto
      }
      return {
        name: typeof use?.name === 'string' ? use.name : '',
        result: parsed,
        isError: c.is_error === true,
      };
    });
    const text = scriptedAnswer(results);
    onText(text);
    return Promise.resolve(msg([{ type: 'text', text, citations: null }], 'end_turn'));
  };
}
