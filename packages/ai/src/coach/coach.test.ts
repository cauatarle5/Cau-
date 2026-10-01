import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';

import { createCoach, type CoachEvent, type CoachTransport } from './coach';
import { coachToolDefinitions, COACH_TOOLS } from './tools';

type Block = Anthropic.Beta.BetaContentBlock;

function message(
  content: Block[],
  stop: Anthropic.Beta.BetaStopReason,
): Anthropic.Beta.BetaMessage {
  return {
    id: 'msg',
    type: 'message',
    role: 'assistant',
    model: 'fake',
    content,
    stop_reason: stop,
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      cache_read_input_tokens: 50,
      cache_creation_input_tokens: 0,
    },
  } as unknown as Anthropic.Beta.BetaMessage;
}
const text = (t: string) => ({ type: 'text', text: t, citations: null }) as Block;
const toolUse = (id: string, name: string, input: unknown) =>
  ({ type: 'tool_use', id, name, input }) as Block;

/** Transporte roteirizado: cada chamada devolve a próxima mensagem e emite o texto dela. */
function scripted(responses: Anthropic.Beta.BetaMessage[]) {
  const calls: Parameters<CoachTransport>[0][] = [];
  const transport: CoachTransport = (params, onText) => {
    calls.push(structuredClone(params));
    const next = responses.shift();
    if (!next) throw new Error('script exhausted');
    for (const b of next.content) if (b.type === 'text') onText(b.text);
    return Promise.resolve(next);
  };
  return { transport, calls };
}

const context = {
  today: '2026-10-01',
  profile: { goal: 'fat_loss' },
  dailyContext: { kcal: 2045 },
};

describe('tool definitions (ADR-054)', () => {
  it('18 strict tools from Zod, no $schema', () => {
    const defs = coachToolDefinitions();
    expect(defs).toHaveLength(18);
    expect(Object.keys(COACH_TOOLS).filter((k) => k.startsWith('propose_'))).toHaveLength(5);
    const period = defs.find((d) => d.name === 'get_period_summary');
    expect(period).toMatchObject({
      strict: true,
      input_schema: { type: 'object', required: ['start', 'end'], additionalProperties: false },
    });
    expect(JSON.stringify(defs)).not.toContain('$schema');
  });
});

describe('createCoach', () => {
  it('runs parallel tools in one round, streams text and returns the turn to persist', async () => {
    const { transport, calls } = scripted([
      message(
        [
          text('Vou olhar sua semana.'),
          toolUse('t1', 'get_period_summary', { start: '2026-09-24', end: '2026-09-30' }),
          toolUse('t2', 'get_insights', { status: null }),
        ],
        'tool_use',
      ),
      message([text('Nos últimos 7 dias você treinou **4** vezes.')], 'end_turn'),
    ]);
    const executeTool = vi.fn((name: string) =>
      Promise.resolve(name === 'get_insights' ? { items: [] } : { sessions: 4 }),
    );
    const events: CoachEvent[] = [];
    const coach = createCoach({ transport, model: 'm', executeTool });
    const r = await coach.reply({
      history: [],
      userText: 'Como foi minha semana?',
      context,
      onEvent: (e) => events.push(e),
    });

    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(r.text).toBe('Vou olhar sua semana.\n\nNos últimos 7 dias você treinou **4** vezes.');
    expect(r.toolCalls.map((c) => c.name)).toEqual(['get_period_summary', 'get_insights']);
    // Assistente (tool_use) + uma única mensagem com os 2 resultados + resposta final.
    expect(r.messages.map((m) => m.role)).toEqual(['assistant', 'user', 'assistant']);
    const results = r.messages[1]?.content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(results.map((b) => b.tool_use_id)).toEqual(['t1', 't2']);
    // Tokens: entrada inclui leituras de cache.
    expect(r.usage).toEqual({ input: 300, output: 40 });
    expect(
      events.filter((e) => e.type === 'tool').map((e) => (e as { name: string }).name),
    ).toEqual(['get_period_summary', 'get_insights']);
    // System fixo com cache e contexto depois; histórico só acrescentado.
    const first = calls[0];
    expect(first?.system).toEqual([
      expect.objectContaining({ cache_control: { type: 'ephemeral' } }),
      expect.objectContaining({ text: expect.stringContaining('Hoje é 2026-10-01') as string }),
    ]);
    expect(first?.tool_choice).toBeUndefined();
    expect(calls[1]?.messages).toHaveLength(3);
  });

  it('tool errors go back as is_error; unknown tools too', async () => {
    const { transport } = scripted([
      message(
        [toolUse('a', 'get_body_trend', { start: 'x', end: 'y' }), toolUse('b', 'drop_tables', {})],
        'tool_use',
      ),
      message([text('Não há pesagens no período.')], 'end_turn'),
    ]);
    const coach = createCoach({
      transport,
      model: 'm',
      executeTool: () => Promise.reject(new Error('Período inválido')),
    });
    const r = await coach.reply({
      history: [],
      userText: 'peso?',
      context,
      onEvent: () => undefined,
    });
    const results = r.messages[1]?.content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(results).toEqual([
      { type: 'tool_result', tool_use_id: 'a', is_error: true, content: 'Período inválido' },
      {
        type: 'tool_result',
        tool_use_id: 'b',
        is_error: true,
        content: 'Ferramenta desconhecida.',
      },
    ]);
    expect(r.toolCalls.every((c) => c.isError)).toBe(true);
  });

  it('stops tools after the round limit and asks for text only', async () => {
    const loop = (id: string) =>
      message([toolUse(id, 'get_insights', { status: null })], 'tool_use');
    const { transport, calls } = scripted([
      loop('1'),
      loop('2'),
      message([text('Resumo final.')], 'end_turn'),
    ]);
    const coach = createCoach({
      transport,
      model: 'm',
      maxToolRounds: 2,
      executeTool: () => Promise.resolve({ items: [] }),
    });
    const r = await coach.reply({ history: [], userText: 'oi', context, onEvent: () => undefined });
    expect(calls[2]?.tool_choice).toEqual({ type: 'none' });
    expect(r.text).toBe('Resumo final.');
  });

  it('refusal ends the turn with a notice and runs no tools', async () => {
    const { transport } = scripted([
      message([toolUse('x', 'get_insights', { status: null })], 'refusal'),
    ]);
    const executeTool = vi.fn();
    const events: CoachEvent[] = [];
    const coach = createCoach({ transport, model: 'm', executeTool });
    const r = await coach.reply({
      history: [],
      userText: '...',
      context,
      onEvent: (e) => events.push(e),
    });
    expect(executeTool).not.toHaveBeenCalled();
    expect(r.stopReason).toBe('refusal');
    expect(events).toContainEqual(expect.objectContaining({ type: 'notice' }));
  });
});
