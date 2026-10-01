import type Anthropic from '@anthropic-ai/sdk';

import {
  CoachTurnError,
  createCoach,
  writeWeeklySummary,
  type CoachTransport,
  type FoodParser,
} from '@atlas/ai';
import { addDays, groundedNumbers, localDate, MIN_KCAL, weekStart } from '@atlas/core';
import type { AiMessageRow } from '@atlas/db';
import type { ChatEvent, ChatMessageDto, ConversationDto } from '@atlas/schemas';

import { AppError, notFound } from '../../lib/errors';
import type { Services } from '../../services';

import { createProposalsService, toProposalDto } from './proposals';
import type { CoachRepository } from './repository';
import { createCoachToolExecutor, TOOL_LABELS } from './tools';

type Ctx = { userId: string; timezone: string; today: string };
type MessageParam = Anthropic.Beta.BetaMessageParam;

export interface PreparedTurn {
  conversation: { id: string };
  transport: CoachTransport;
  model: string;
  /** Libera a vaga de turno do usuário (um turno por vez). */
  release: () => void;
}

/** Números das travas citados no system prompt (P5.7): contam como fonte (ADR-055). */
const RULE_NUMBERS = { minKcal: MIN_KCAL, maxDeficitPct: 25 };

export interface CoachConfig {
  /** `null` = IA indisponível (sem chave/modelo): chat responde 503 (ADR-056). */
  transport: CoachTransport | null;
  model: string | null;
  dailyTokenLimit: number;
}

const toConversationDto = (r: {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}): ConversationDto => ({
  id: r.id,
  title: r.title,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

/** Início do dia local do usuário, como instante (limite diário de tokens). */
function startOfLocalDay(now: Date, timeZone: string): Date {
  const today = localDate(now, timeZone);
  // Busca o primeiro instante (de hora em hora) cujo dia local já é hoje.
  // Começa na meia-noite UTC da véspera: cobre fusos até UTC+14.
  let t = new Date(`${addDays(today, -1)}T00:00:00Z`).getTime();
  while (localDate(new Date(t), timeZone) !== today) t += 15 * 60_000;
  return new Date(t);
}

export function createCoachService(deps: {
  repo: CoachRepository;
  svc: Services;
  parser: FoodParser;
  config: CoachConfig;
}) {
  const { repo, svc, config } = deps;
  const proposals = createProposalsService({ repo, svc, parser: deps.parser });
  // Um turno por usuário por vez (processo único): pedidos paralelos não furam o limite diário.
  const activeTurns = new Set<string>();

  async function toMessages(rows: AiMessageRow[], userId: string): Promise<ChatMessageDto[]> {
    const ids = rows.flatMap((r) =>
      (r.toolCalls as { proposalIds?: string[] }[]).flatMap((c) => c.proposalIds ?? []),
    );
    const byId = new Map((await repo.proposalsByIds(userId, ids)).map((p) => [p.id, p]));
    return rows.map((r) => {
      const calls = r.toolCalls as { name: string; proposalIds?: string[] }[];
      return {
        id: r.id,
        role: r.role,
        text: r.text,
        toolCalls: calls.filter((c) => c.name !== '_proposals').map((c) => c.name),
        proposals: calls.flatMap((c) =>
          (c.proposalIds ?? []).flatMap((pid) => {
            const p = byId.get(pid);
            return p ? [toProposalDto(p)] : [];
          }),
        ),
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  async function sendTurn(
    ctx: Ctx,
    prepared: PreparedTurn,
    text: string,
    emit: (e: ChatEvent) => void,
    signal?: AbortSignal,
  ) {
    const { conversation, transport, model } = prepared;
    const rows = await repo.listMessages(ctx.userId, conversation.id);
    const history = rows.flatMap((r) => r.content as MessageParam[]);
    await repo.insertMessage(ctx.userId, {
      conversationId: conversation.id,
      role: 'user',
      text,
      content: [{ role: 'user', content: text }],
    });

    const proposalIds: string[] = [];
    const executeTool = createCoachToolExecutor({
      svc,
      proposals,
      ctx,
      conversationId: conversation.id,
      onProposal: (id) => proposalIds.push(id),
    });
    const [profile, dailyContext] = await Promise.all([
      executeTool('get_profile_summary', {}),
      executeTool('get_daily_context', { date: ctx.today }),
    ]);
    const coach = createCoach({
      transport,
      model,
      executeTool: async (name, input) => {
        const before = proposalIds.length;
        const result = await executeTool(name, input);
        for (const pid of proposalIds.slice(before)) {
          const [p] = await repo.proposalsByIds(ctx.userId, [pid]);
          if (p) emit({ type: 'proposal', proposal: toProposalDto(p) });
        }
        return result;
      },
    });

    try {
      const turn = await coach.reply({
        history,
        userText: text,
        context: { today: ctx.today, profile, dailyContext },
        ...(signal ? { signal } : {}),
        onEvent: (e) => {
          if (e.type === 'tool')
            emit({
              type: 'tool',
              name: e.name,
              label: Object.hasOwn(TOOL_LABELS, e.name)
                ? TOOL_LABELS[e.name as keyof typeof TOOL_LABELS]
                : 'Consultando',
            });
          else emit(e);
        },
      });
      const grounding = groundedNumbers(
        turn.text,
        [RULE_NUMBERS, profile, dailyContext, ...turn.toolCalls.map((c) => c.result)],
        { ignoreText: text },
      );
      // A pergunta já foi gravada; a resposta guarda o turno inteiro (só acrescentado).
      const toolCalls = turn.toolCalls.map((c) => ({ name: c.name, isError: c.isError }));
      const assistant = await repo.insertMessage(ctx.userId, {
        conversationId: conversation.id,
        role: 'assistant',
        text: turn.text,
        content: turn.messages,
        toolCalls: [...toolCalls, { name: '_proposals', proposalIds }],
        ungrounded: grounding.ungrounded,
        tokensIn: turn.usage.input,
        tokensOut: turn.usage.output,
        model,
      });
      await repo.touchConversation(
        ctx.userId,
        conversation.id,
        rows.length === 0 ? text.slice(0, 60) : undefined,
      );
      const [dto] = await toMessages([assistant], ctx.userId);
      if (dto) emit({ type: 'done', message: { ...dto, toolCalls: toolCalls.map((c) => c.name) } });
    } catch (err) {
      // Sem resposta: grava um aviso do assistente (histórico continua alternado e válido) com os
      // tokens já gastos, que contam no limite diário.
      const usage = err instanceof CoachTurnError ? err.usage : { input: 0, output: 0 };
      await repo.insertMessage(ctx.userId, {
        conversationId: conversation.id,
        role: 'assistant',
        text: 'Não consegui responder agora.',
        content: [{ role: 'assistant', content: [{ type: 'text', text: '(falha ao responder)' }] }],
        tokensIn: usage.input,
        tokensOut: usage.output,
        model,
      });
      throw err instanceof CoachTurnError ? err.original : err;
    }
  }

  async function tokensToday(ctx: Ctx) {
    return repo.tokensSince(ctx.userId, startOfLocalDay(new Date(), ctx.timezone));
  }

  return {
    proposals,

    async status(ctx: Ctx) {
      return {
        available: config.transport !== null && config.model !== null,
        tokensToday: await tokensToday(ctx),
        dailyLimit: config.dailyTokenLimit,
      };
    },

    async createConversation(userId: string, title?: string) {
      return toConversationDto(await repo.createConversation(userId, title ?? 'Nova conversa'));
    },

    async listConversations(userId: string) {
      return { items: (await repo.listConversations(userId)).map(toConversationDto) };
    },

    async getConversation(userId: string, id: string) {
      const c = await repo.getConversation(userId, id);
      if (!c) throw notFound('Conversa');
      await repo.expireProposals(userId, new Date());
      return {
        ...toConversationDto(c),
        messages: await toMessages(await repo.listMessages(userId, id), userId),
      };
    },

    /** Valida tudo antes de abrir o stream: erros aqui viram RFC 7807 normais. */
    async prepare(ctx: Ctx, conversationId: string): Promise<PreparedTurn> {
      const conversation = await repo.getConversation(ctx.userId, conversationId);
      if (!conversation) throw notFound('Conversa');
      if (!config.transport || !config.model)
        throw new AppError(
          503,
          'AI_UNAVAILABLE',
          'Coach indisponível',
          'A IA não está configurada agora. O restante do Atlas funciona normalmente.',
        );
      if ((await tokensToday(ctx)) >= config.dailyTokenLimit)
        throw new AppError(
          429,
          'AI_DAILY_LIMIT',
          'Limite diário do Coach',
          'Você atingiu o limite de uso do Coach por hoje. Volte amanhã.',
        );
      if (activeTurns.has(ctx.userId))
        throw new AppError(
          429,
          'RATE_LIMITED',
          'Resposta em andamento',
          'Aguarde o Coach terminar a resposta anterior.',
        );
      activeTurns.add(ctx.userId);
      return {
        conversation,
        transport: config.transport,
        model: config.model,
        release: () => {
          activeTurns.delete(ctx.userId);
        },
      };
    },

    /**
     * Responde a uma mensagem com streaming (ADR-054): grava a pergunta, roda o Coach com as
     * ferramentas do usuário, grava a resposta (tokens, números não ancorados) e emite eventos.
     */
    async send(
      ctx: Ctx,
      prepared: PreparedTurn,
      text: string,
      emit: (e: ChatEvent) => void,
      signal?: AbortSignal,
    ) {
      try {
        await sendTurn(ctx, prepared, text, emit, signal);
      } finally {
        prepared.release();
      }
    },

    async weeklySummary(userId: string) {
      const row = await repo.latestWeeklySummary(userId);
      return {
        summary: row
          ? {
              weekStart: row.weekStart,
              text: row.text,
              source: row.source,
              createdAt: row.createdAt.toISOString(),
            }
          : null,
      };
    },

    /** Resumo da semana anterior a `today` (P10.5); idempotente por (usuário, semana). */
    async refreshWeeklySummary(userId: string, today: string, onError?: (err: unknown) => void) {
      const ws = addDays(weekStart(today), -7);
      const we = addDays(ws, 6);
      const [period, insights] = await Promise.all([
        svc.analytics.summary(userId, ws, we, today),
        svc.insights.list(userId),
      ]);
      const s = period.summary;
      const data = {
        weekStart: ws,
        weekEnd: we,
        summary: {
          training: {
            sessions: s.training.sessions,
            adherencePct: s.training.adherencePct,
            tonnage: s.training.tonnage,
          },
          nutrition: {
            completeDays: s.nutrition.completeDays,
            avgKcal: s.nutrition.avgKcal,
            avgProteinG: s.nutrition.avgProteinG,
          },
          body: { changeKg: s.body.changeKg, endTrendKg: s.body.endTrendKg },
          recovery: {
            avgSleepHours: s.recovery.avgSleepHours,
            avgReadiness: s.recovery.avgReadiness,
          },
        },
        insights: insights.items.slice(0, 3).map((i) => ({ title: i.title, body: i.body })),
      };
      const written = await writeWeeklySummary({
        data,
        transport: config.transport,
        model: config.model,
        ...(onError ? { onError } : {}),
      });
      const row = await repo.upsertWeeklySummary(userId, {
        weekStart: ws,
        text: written.text,
        source: written.source,
        data,
        model: written.model,
      });
      return {
        weekStart: row.weekStart,
        text: row.text,
        source: row.source,
        createdAt: row.createdAt.toISOString(),
      };
    },

    hasWeeklySummary: (userId: string, today: string) =>
      repo.hasWeeklySummary(userId, addDays(weekStart(today), -7)),
  };
}

export type CoachService = ReturnType<typeof createCoachService>;
