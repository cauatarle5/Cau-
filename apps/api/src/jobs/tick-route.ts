import { createHash, timingSafeEqual } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import { unauthorized } from '../lib/errors';

import { runTick, type JobDeps } from './worker';

const digest = (s: string) => createHash('sha256').update(s).digest();

/**
 * Rodada horária dos jobs por HTTP (ADR-064), para hospedagem sem processo contínuo: um agendador
 * externo (GitHub Actions) chama `POST /api/v1/internal/tick` com `Authorization: Bearer <segredo>`.
 * Mesmo `runTick` do worker pg-boss; idempotente por usuário e semana.
 */
export function tickRoute(app: FastifyInstance, opts: { secret: string; deps: JobDeps }) {
  const expected = digest(opts.secret);
  app.post(
    '/api/v1/internal/tick',
    { schema: { hide: true }, config: { rateLimit: { max: 10, timeWindow: 60_000 } } },
    async (request) => {
      const header = request.headers.authorization ?? '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      // Comparação em tempo constante sobre os hashes (tamanhos iguais).
      if (!timingSafeEqual(digest(token), expected)) throw unauthorized();
      const result = await runTick(opts.deps, new Date());
      request.log.info(result, 'tick via http done');
      return { ok: true, ...result };
    },
  );
}
