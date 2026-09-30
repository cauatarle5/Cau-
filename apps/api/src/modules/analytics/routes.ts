import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { muscleVolumeQuerySchema, muscleVolumeSchema, problemDetailsSchema } from '@atlas/schemas';

import { authed } from '../../lib/request';

import type { AnalyticsService } from './service';

export function analyticsRoutes(app: FastifyInstance, opts: { service: AnalyticsService }) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get(
    '/analytics/muscle-volume',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['analytics'],
        querystring: muscleVolumeQuerySchema,
        response: { 200: muscleVolumeSchema, 400: problemDetailsSchema, 401: problemDetailsSchema },
      },
    },
    (req) => {
      const { userId, today } = authed(req);
      return opts.service.muscleVolume(userId, today, req.query.weekStart);
    },
  );
}
