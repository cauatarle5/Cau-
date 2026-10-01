import type Anthropic from '@anthropic-ai/sdk';

import { COACH_SYSTEM, coachContextBlock } from '../prompts/coach';

import { coachToolDefinitions, isCoachTool, type CoachToolName } from './tools';

type MessageParam = Anthropic.Beta.BetaMessageParam;
type StreamParams = Parameters<Anthropic['beta']['messages']['stream']>[0];

/**
 * Uma chamada com streaming: entrega os deltas de texto e devolve a mensagem final. O cliente real
 * usa `client.beta.messages.stream`; os testes e o modo `AI_FAKE` usam um roteiro.
 */
export type CoachTransport = (
  params: StreamParams,
  onText: (delta: string) => void,
  signal?: AbortSignal,
) => Promise<Anthropic.Beta.BetaMessage>;

export function anthropicTransport(client: Anthropic): CoachTransport {
  return async (params, onText, signal) => {
    const stream = client.beta.messages.stream(params, signal ? { signal } : {});
    stream.on('text', onText);
    return stream.finalMessage();
  };
}

/** Falha no meio do turno, com os tokens já gastos (o limite diário conta tudo). */
export class CoachTurnError extends Error {
  constructor(
    readonly original: unknown,
    readonly usage: { input: number; output: number },
  ) {
    super(original instanceof Error ? original.message : 'coach turn failed');
    this.name = 'CoachTurnError';
  }
}

/**
 * Histórico para reenviar: resultados de ferramentas de turnos passados viram um aviso curto
 * (mesmo formato, pares tool_use/tool_result preservados), para o contexto não crescer sem fim.
 */
export function compactHistory(history: readonly MessageParam[]): MessageParam[] {
  return history.map((m) =>
    m.role === 'user' && Array.isArray(m.content)
      ? {
          ...m,
          content: m.content.map((b) =>
            b.type === 'tool_result'
              ? { ...b, content: '(resultado de um turno anterior; consulte de novo se precisar)' }
              : b,
          ),
        }
      : m,
  );
}

export type CoachEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool'; name: string }
  | { type: 'notice'; message: string };

export interface ToolCallRecord {
  name: string;
  input: unknown;
  result: unknown;
  isError: boolean;
}

export interface CoachTurnResult {
  /** Mensagens do turno (assistente e resultados de ferramentas) para gravar no histórico. */
  messages: MessageParam[];
  text: string;
  toolCalls: ToolCallRecord[];
  usage: { input: number; output: number };
  stopReason: string | null;
}

export interface CoachOptions {
  transport: CoachTransport;
  model: string;
  maxTokens?: number;
  maxToolRounds?: number;
  /** Executa uma ferramenta do usuário da sessão; erros viram `is_error` para o modelo. */
  executeTool: (name: CoachToolName, input: unknown) => Promise<unknown>;
}

const MAX_ROUNDS = 6;

/** Coach com laço manual de ferramentas e streaming (ADR-054). */
export function createCoach(options: CoachOptions) {
  const { transport, model, executeTool } = options;
  const maxTokens = options.maxTokens ?? 16000;
  const maxRounds = options.maxToolRounds ?? MAX_ROUNDS;
  const tools = coachToolDefinitions();

  return {
    /**
     * Responde a uma mensagem. `history` são as mensagens já gravadas (somente acrescentadas,
     * nunca reescritas); o turno devolve o que precisa ser gravado.
     */
    async reply(params: {
      history: readonly MessageParam[];
      userText: string;
      context: { today: string; profile: unknown; dailyContext: unknown };
      onEvent: (e: CoachEvent) => void;
      signal?: AbortSignal;
    }): Promise<CoachTurnResult> {
      // Cache: prompt fixo e contexto do dia (resumo do perfil, P10.6); o histórico usa o cache
      // automático do último bloco.
      const system: Anthropic.Beta.BetaTextBlockParam[] = [
        { type: 'text', text: COACH_SYSTEM, cache_control: { type: 'ephemeral' } },
        {
          type: 'text',
          text: coachContextBlock(params.context),
          cache_control: { type: 'ephemeral' },
        },
      ];
      const messages: MessageParam[] = [
        ...compactHistory(params.history),
        { role: 'user', content: params.userText },
      ];
      const turn: MessageParam[] = [];
      const toolCalls: ToolCallRecord[] = [];
      const usage = { input: 0, output: 0 };
      let text = '';
      let stopReason: string | null;

      try {
        for (let round = 0; ; round++) {
          if (params.signal?.aborted) throw new Error('aborted');
          const lastRound = round >= maxRounds;
          const message = await transport(
            {
              model,
              max_tokens: maxTokens,
              system,
              tools,
              // Depois do limite de rodadas, só texto.
              ...(lastRound ? { tool_choice: { type: 'none' as const } } : {}),
              messages: [...messages, ...turn],
              betas: ['server-side-fallback-2026-07-01'],
              fallbacks: 'default',
              cache_control: { type: 'ephemeral' },
            },
            (delta) => {
              text += delta;
              params.onEvent({ type: 'text', delta });
            },
            params.signal,
          );
          usage.input +=
            message.usage.input_tokens +
            (message.usage.cache_read_input_tokens ?? 0) +
            (message.usage.cache_creation_input_tokens ?? 0);
          usage.output += message.usage.output_tokens;
          stopReason = message.stop_reason;
          const uses = message.content.filter(
            (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
          );
          const runsTools = message.stop_reason === 'tool_use' && uses.length > 0;
          // Sem execução, nenhum tool_use pode ficar sem resultado no histórico (cortado por
          // max_tokens ou recusa); conteúdo vazio vira um aviso.
          const kept = runsTools
            ? message.content
            : message.content.filter((b) => b.type !== 'tool_use');
          turn.push({
            role: 'assistant',
            content: kept.length > 0 ? kept : [{ type: 'text', text: '(resposta interrompida)' }],
          });

          if (message.stop_reason === 'max_tokens') {
            params.onEvent({
              type: 'notice',
              message: 'A resposta ficou longa demais e foi cortada. Peça um resumo mais curto.',
            });
            break;
          }
          if (message.stop_reason === 'refusal') {
            params.onEvent({
              type: 'notice',
              message: 'Não consigo ajudar com esse pedido. Tente reformular.',
            });
            break;
          }
          if (message.stop_reason === 'pause_turn') continue;
          if (!runsTools) break;

          // Chamadas paralelas: executa todas e devolve numa única mensagem.
          const records: ToolCallRecord[] = [];
          const results = await Promise.all(
            uses.map(async (u, i): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
              params.onEvent({ type: 'tool', name: u.name });
              if (!isCoachTool(u.name)) {
                records[i] = {
                  name: u.name,
                  input: u.input,
                  result: 'unknown tool',
                  isError: true,
                };
                return {
                  type: 'tool_result',
                  tool_use_id: u.id,
                  is_error: true,
                  content: 'Ferramenta desconhecida.',
                };
              }
              try {
                const result = await executeTool(u.name, u.input);
                records[i] = { name: u.name, input: u.input, result, isError: false };
                return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(result) };
              } catch (err) {
                const msg = err instanceof Error ? err.message : 'Falha ao consultar os dados.';
                records[i] = { name: u.name, input: u.input, result: msg, isError: true };
                return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: msg };
              }
            }),
          );
          // Na ordem em que o modelo pediu, não na de conclusão.
          toolCalls.push(...records);
          turn.push({ role: 'user', content: results });
          if (text && !text.endsWith('\n')) {
            text += '\n\n';
            params.onEvent({ type: 'text', delta: '\n\n' });
          }
        }
      } catch (err) {
        throw new CoachTurnError(err, usage);
      }
      return { messages: turn, text: text.trim(), toolCalls, usage, stopReason };
    },
  };
}
