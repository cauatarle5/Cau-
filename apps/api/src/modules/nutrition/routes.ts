import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { daysBetween } from '@atlas/core';
import { dateRangeQuerySchema, problemDetailsSchema, targetsResponseSchema } from '@atlas/schemas';

import { validationError } from '../../lib/errors';
import { authed } from '../../lib/request';

import type { NutritionService } from './service';

export const MAX_TARGET_RANGE_DAYS = 92;

export function nutritionRoutes(app: FastifyInstance, opts: { service: NutritionService }) {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/nutrition/targets',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['nutrition'],
        querystring: dateRangeQuerySchema,
        response: {
          200: targetsResponseSchema,
          400: problemDetailsSchema,
          401: problemDetailsSchema,
        },
      },
    },
    (req) => {
      const { userId, today } = authed(req);
      const { from, to } = req.query;
      if (daysBetween(from, to) >= MAX_TARGET_RANGE_DAYS) {
        throw validationError([
          { field: 'to', message: `Período máximo de ${MAX_TARGET_RANGE_DAYS} dias` },
        ]);
      }
      return opts.service.targets(userId, from, to, today);
    },
  );
}
