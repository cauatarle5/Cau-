import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import {
  analyticsCompareQuerySchema,
  analyticsCompareSchema,
  analyticsSummaryQuerySchema,
  analyticsSummarySchema,
  muscleVolumeQuerySchema,
  muscleVolumeSchema,
  problemDetailsSchema,
} from '@atlas/schemas';

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

  r.get(
    '/analytics/summary',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['analytics'],
        querystring: analyticsSummaryQuerySchema,
        response: {
          200: analyticsSummarySchema,
          400: problemDetailsSchema,
          401: problemDetailsSchema,
        },
      },
    },
    (req) => {
      const { userId, today } = authed(req);
      return opts.service.summary(userId, req.query.from, req.query.to, today);
    },
  );

  r.get(
    '/analytics/compare',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['analytics'],
        querystring: analyticsCompareQuerySchema,
        response: {
          200: analyticsCompareSchema,
          400: problemDetailsSchema,
          401: problemDetailsSchema,
        },
      },
    },
    (req) => {
      const { userId, today } = authed(req);
      return opts.service.compare(userId, req.query, today);
    },
  );
}
