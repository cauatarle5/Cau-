import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  accountExportSchema,
  deleteAccountInputSchema,
  problemDetailsSchema,
} from '@atlas/schemas';

import { unauthorized } from '../../lib/errors';
import { SESSION_COOKIE } from '../auth/tokens';

import type { AccountService } from './service';

export interface AccountRoutesOptions {
  service: AccountService;
  cookieSecure: boolean;
  rateLimitMax: number;
}

/** Conta (P3.4/P13): `GET account/export` e `DELETE account` (ADR-061). */
export function accountRoutes(app: FastifyInstance, opts: AccountRoutesOptions) {
  const { service } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const limit = { max: opts.rateLimitMax, timeWindow: 60_000 };

  r.get(
    '/account/export',
    {
      preHandler: app.requireAuth,
      config: { rateLimit: limit },
      schema: {
        tags: ['account'],
        response: {
          200: accountExportSchema,
          401: problemDetailsSchema,
          429: problemDetailsSchema,
        },
      },
    },
    async (request, reply) => {
      if (!request.auth) throw unauthorized();
      const data = await service.export(request.auth.userId);
      void reply.header(
        'content-disposition',
        `attachment; filename="atlas-${data.exportedAt.slice(0, 10)}.json"`,
      );
      void reply.header('cache-control', 'no-store');
      return data;
    },
  );

  r.delete(
    '/account',
    {
      preHandler: app.requireAuth,
      config: { rateLimit: limit },
      schema: {
        tags: ['account'],
        body: deleteAccountInputSchema,
        response: {
          204: z.null(),
          400: problemDetailsSchema,
          401: problemDetailsSchema,
          429: problemDetailsSchema,
        },
      },
    },
    async (request, reply) => {
      if (!request.auth) throw unauthorized();
      await service.delete(request.auth.userId, request.body);
      void reply.clearCookie(SESSION_COOKIE, {
        httpOnly: true,
        secure: opts.cookieSecure,
        sameSite: 'lax',
        path: '/',
      });
      return reply.status(204).send(null);
    },
  );
}
