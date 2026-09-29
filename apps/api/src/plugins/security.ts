import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { AppError } from '../lib/errors.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface SecurityOptions {
  webOrigin: string;
}

/** helmet, CORS restrito, cookies, rate limit e verificação de Origin (CSRF). */
export const securityPlugin = fp(async (app: FastifyInstance, opts: SecurityOptions) => {
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: opts.webOrigin, credentials: true });
  await app.register(cookie);
  // Global desligado: limites são declarados por rota (config.rateLimit).
  await app.register(rateLimit, { global: false });

  app.addHook('onRequest', (request, _reply, done) => {
    const origin = request.headers.origin;
    // Sem Origin (clientes não-navegador) é aceito; SameSite=Lax cobre o resto (ADR-007).
    if (WRITE_METHODS.has(request.method) && origin !== undefined && origin !== opts.webOrigin) {
      done(new AppError(403, 'ORIGIN_FORBIDDEN', 'Origem não permitida'));
      return;
    }
    done();
  });
});
