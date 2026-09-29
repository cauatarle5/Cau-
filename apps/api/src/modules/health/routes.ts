import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { type Database, sql } from '@atlas/db';
import { healthResponseSchema } from '@atlas/schemas';

export function healthRoutes(app: FastifyInstance, opts: { db: Database }) {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/health',
    {
      schema: {
        tags: ['health'],
        response: { 200: healthResponseSchema, 503: healthResponseSchema },
      },
    },
    async (request, reply) => {
      let dbUp = true;
      try {
        await opts.db.execute(sql`select 1`);
      } catch (err) {
        request.log.error({ err }, 'health: database unreachable');
        dbUp = false;
      }
      return reply.status(dbUp ? 200 : 503).send({
        status: dbUp ? 'ok' : 'degraded',
        db: dbUp ? 'up' : 'down',
        time: new Date().toISOString(),
      });
    },
  );
}
