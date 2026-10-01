import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import {
  aiStatusSchema,
  chatSendSchema,
  conversationCreateSchema,
  conversationDetailSchema,
  conversationListSchema,
  conversationSchema,
  idParamSchema,
  problemDetailsSchema,
  proposalListSchema,
  proposalQuerySchema,
  proposalSchema,
  weeklySummaryResponseSchema,
  weeklySummarySchema,
  type ChatEvent,
} from '@atlas/schemas';

import { AppError } from '../../lib/errors';
import { authed } from '../../lib/request';

import type { CoachService } from './service';

const errors = {
  400: problemDetailsSchema,
  401: problemDetailsSchema,
  404: problemDetailsSchema,
  409: problemDetailsSchema,
  429: problemDetailsSchema,
  503: problemDetailsSchema,
};

export function coachRoutes(
  app: FastifyInstance,
  opts: { service: CoachService; aiRateLimitMax: number },
) {
  const { service } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const base = { preHandler: app.requireAuth };
  // Mesmo limite por minuto dos outros endpoints de IA (P3.4), por usuário.
  const aiLimiter = app.createRateLimit({
    max: opts.aiRateLimitMax,
    timeWindow: 60_000,
    keyGenerator: (req) => `ai:${req.auth?.userId ?? req.ip}`,
  });
  const aiLimit = async (req: FastifyRequest, reply: FastifyReply) => {
    const result = await aiLimiter(req);
    if (!result.isAllowed && result.isExceeded) {
      void reply.header('retry-after', String(result.ttlInSeconds));
      throw new AppError(
        429,
        'RATE_LIMITED',
        'Muitas mensagens',
        'Aguarde um minuto e tente de novo.',
      );
    }
  };

  r.get(
    '/ai/status',
    { ...base, schema: { tags: ['ai'], response: { 200: aiStatusSchema, ...errors } } },
    (req) => service.status(authed(req)),
  );

  r.post(
    '/ai/conversations',
    {
      ...base,
      schema: {
        tags: ['ai'],
        body: conversationCreateSchema.optional(),
        response: { 201: conversationSchema, ...errors },
      },
    },
    async (req, reply) =>
      reply.status(201).send(await service.createConversation(authed(req).userId, req.body?.title)),
  );

  r.get(
    '/ai/conversations',
    { ...base, schema: { tags: ['ai'], response: { 200: conversationListSchema, ...errors } } },
    (req) => service.listConversations(authed(req).userId),
  );

  r.get(
    '/ai/conversations/:id',
    {
      ...base,
      schema: {
        tags: ['ai'],
        params: idParamSchema,
        response: { 200: conversationDetailSchema, ...errors },
      },
    },
    (req) => service.getConversation(authed(req).userId, req.params.id),
  );

  /** Resposta em SSE (P10.6): validação antes do stream; depois, erros viram evento `error`. */
  r.post(
    '/ai/conversations/:id/messages',
    {
      preHandler: [app.requireAuth, aiLimit],
      schema: { tags: ['ai'], params: idParamSchema, body: chatSendSchema },
    },
    async (req, reply) => {
      const ctx = authed(req);
      const prepared = await service.prepare(ctx, req.params.id);
      reply.hijack();
      // Aba fechada: cancela a chamada ao modelo (não gasta tokens à toa).
      const abort = new AbortController();
      reply.raw.on('close', () => {
        if (!reply.raw.writableFinished) abort.abort();
      });
      const res = reply.raw;
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
        'x-request-id': req.id,
      });
      const emit = (e: ChatEvent) => {
        if (!res.writableEnded) res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
      };
      // Comentário periódico para proxies não fecharem a conexão durante as ferramentas.
      const heartbeat = setInterval(() => {
        if (!res.writableEnded) res.write(': ping\n\n');
      }, 15_000);
      try {
        await service.send(ctx, prepared, req.body.text, emit, abort.signal);
      } catch (err) {
        req.log.error({ err }, 'coach turn failed');
        emit({
          type: 'error',
          code: err instanceof AppError ? err.code : 'AI_ERROR',
          message:
            err instanceof AppError
              ? (err.detail ?? err.title)
              : 'O Coach não conseguiu responder agora. Tente de novo em instantes.',
        });
      } finally {
        clearInterval(heartbeat);
        res.end();
      }
    },
  );

  r.get(
    '/ai/proposals',
    {
      ...base,
      schema: {
        tags: ['ai'],
        querystring: proposalQuerySchema,
        response: { 200: proposalListSchema, ...errors },
      },
    },
    (req) => service.proposals.list(authed(req).userId, req.query.status),
  );

  r.post(
    '/ai/proposals/:id/accept',
    {
      ...base,
      schema: { tags: ['ai'], params: idParamSchema, response: { 200: proposalSchema, ...errors } },
    },
    (req) => service.proposals.accept(authed(req), req.params.id),
  );

  r.post(
    '/ai/proposals/:id/reject',
    {
      ...base,
      schema: { tags: ['ai'], params: idParamSchema, response: { 200: proposalSchema, ...errors } },
    },
    (req) => service.proposals.reject(authed(req).userId, req.params.id),
  );

  r.get(
    '/ai/weekly-summary',
    {
      ...base,
      schema: { tags: ['ai'], response: { 200: weeklySummaryResponseSchema, ...errors } },
    },
    (req) => service.weeklySummary(authed(req).userId),
  );

  r.post(
    '/ai/weekly-summary/refresh',
    { ...base, schema: { tags: ['ai'], response: { 200: weeklySummarySchema, ...errors } } },
    (req) => {
      const { userId, today } = authed(req);
      return service.refreshWeeklySummary(userId, today, (err) => {
        req.log.warn({ err }, 'weekly summary AI failed; using template');
      });
    },
  );
}
