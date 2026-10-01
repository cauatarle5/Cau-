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
) => Promise<Anthropic.Beta.BetaMessage>;

export function anthropicTransport(client: Anthropic): CoachTransport {
  return async (params, onText) => {
    const stream = client.beta.messages.stream(params);
    stream.on('text', onText);
    return stream.finalMessage();
  };
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
    }): Promise<CoachTurnResult> {
      const system: Anthropic.Beta.BetaTextBlockParam[] = [
        { type: 'text', text: COACH_SYSTEM, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: coachContextBlock(params.context) },
      ];
      const messages: MessageParam[] = [
        ...params.history,
        { role: 'user', content: params.userText },
      ];
      const turn: MessageParam[] = [];
      const toolCalls: ToolCallRecord[] = [];
      const usage = { input: 0, output: 0 };
      let text = '';
      let stopReason: string | null;

      for (let round = 0; ; round++) {
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
          },
          (delta) => {
            text += delta;
            params.onEvent({ type: 'text', delta });
          },
        );
        usage.input +=
          message.usage.input_tokens +
          (message.usage.cache_read_input_tokens ?? 0) +
          (message.usage.cache_creation_input_tokens ?? 0);
        usage.output += message.usage.output_tokens;
        stopReason = message.stop_reason;
        turn.push({ role: 'assistant', content: message.content });

        if (message.stop_reason === 'refusal') {
          params.onEvent({
            type: 'notice',
            message: 'Não consigo ajudar com esse pedido. Tente reformular.',
          });
          break;
        }
        if (message.stop_reason === 'pause_turn') continue;
        const uses = message.content.filter(
          (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
        );
        if (message.stop_reason !== 'tool_use' || uses.length === 0) break;

        // Chamadas paralelas: executa todas e devolve numa única mensagem.
        const results = await Promise.all(
          uses.map(async (u): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
            params.onEvent({ type: 'tool', name: u.name });
            if (!isCoachTool(u.name)) {
              toolCalls.push({
                name: u.name,
                input: u.input,
                result: 'unknown tool',
                isError: true,
              });
              return {
                type: 'tool_result',
                tool_use_id: u.id,
                is_error: true,
                content: 'Ferramenta desconhecida.',
              };
            }
            try {
              const result = await executeTool(u.name, u.input);
              toolCalls.push({ name: u.name, input: u.input, result, isError: false });
              return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(result) };
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Falha ao consultar os dados.';
              toolCalls.push({ name: u.name, input: u.input, result: msg, isError: true });
              return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: msg };
            }
          }),
        );
        turn.push({ role: 'user', content: results });
        if (text && !text.endsWith('\n')) {
          text += '\n\n';
          params.onEvent({ type: 'text', delta: '\n\n' });
        }
      }

      return { messages: turn, text: text.trim(), toolCalls, usage, stopReason };
    },
  };
}
