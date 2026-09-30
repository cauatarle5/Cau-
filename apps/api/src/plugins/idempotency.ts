import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import { and, eq, idempotencyKeys, type Database } from '@atlas/db';

import { AppError } from '../lib/errors';

const KEY_PATTERN = /^[\w-]{8,100}$/;

declare module 'fastify' {
  interface FastifyInstance {
    /** preHandler (após `requireAuth`): repete a resposta gravada para a mesma `Idempotency-Key`. */
    idempotent: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    idempotencyKey: string | null;
  }
}

/** `Idempotency-Key` em criações (ADR-034): guarda (usuário, chave) → resposta 2xx. */
export const idempotencyPlugin = fp((app: FastifyInstance, opts: { db: Database }) => {
  const { db } = opts;
  app.decorateRequest('idempotencyKey', null);

  app.decorate('idempotent', async (request: FastifyRequest, reply: FastifyReply) => {
    const raw = request.headers['idempotency-key'];
    if (raw === undefined || !request.auth) return;
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (!key || !KEY_PATTERN.test(key)) {
      throw new AppError(400, 'BAD_REQUEST', 'Idempotency-Key inválida');
    }
    const path = request.url.split('?')[0] ?? '';
    const [hit] = await db
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.userId, request.auth.userId), eq(idempotencyKeys.key, key)))
      .limit(1);
    if (hit) {
      if (hit.method !== request.method || hit.path !== path) {
        throw new AppError(
          422,
          'IDEMPOTENCY_KEY_REUSED',
          'Chave de idempotência já usada',
          'Esta Idempotency-Key pertence a outra operação.',
        );
      }
      await reply
        .status(hit.statusCode)
        .header('idempotent-replayed', 'true')
        .send(hit.response ?? undefined);
      return reply;
    }
    request.idempotencyKey = key;
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const key = request.idempotencyKey;
    if (!key || !request.auth || reply.statusCode < 200 || reply.statusCode >= 300) return payload;
    let response: unknown = null;
    if (typeof payload === 'string' && payload.length > 0) {
      try {
        response = JSON.parse(payload);
      } catch {
        response = null;
      }
    }
    await db
      .insert(idempotencyKeys)
      .values({
        userId: request.auth.userId,
        key,
        method: request.method,
        path: request.url.split('?')[0] ?? '',
        statusCode: reply.statusCode,
        response,
      })
      .onConflictDoNothing();
    return payload;
  });
});
