import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import {
  dailyContextSchema,
  dayParamSchema,
  energyEstimateSchema,
  energyEstimatesSchema,
  idParamSchema,
  insightListSchema,
  insightPatchSchema,
  insightRefreshSchema,
  insightSchema,
  insightsQuerySchema,
  problemDetailsSchema,
} from '@atlas/schemas';

import { authed } from '../../lib/request';

import type { DailyContextService } from './context';
import type { EnergyService } from './energy';
import type { InsightsService } from './service';

const errors = { 400: problemDetailsSchema, 401: problemDetailsSchema, 404: problemDetailsSchema };

export function insightsRoutes(
  app: FastifyInstance,
  opts: { insights: InsightsService; energy: EnergyService; context: DailyContextService },
) {
  const { insights, energy, context } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const base = { preHandler: app.requireAuth };

  r.get(
    '/daily-context/:date',
    {
      ...base,
      schema: {
        tags: ['context'],
        params: dayParamSchema,
        response: { 200: dailyContextSchema, ...errors },
      },
    },
    (req) => context.get(authed(req), req.params.date),
  );

  r.get(
    '/insights',
    {
      ...base,
      schema: {
        tags: ['insights'],
        querystring: insightsQuerySchema,
        response: { 200: insightListSchema, ...errors },
      },
    },
    (req) => insights.list(authed(req).userId, req.query.status),
  );

  r.patch(
    '/insights/:id',
    {
      ...base,
      schema: {
        tags: ['insights'],
        params: idParamSchema,
        body: insightPatchSchema,
        response: { 200: insightSchema, ...errors },
      },
    },
    (req) => insights.setStatus(authed(req).userId, req.params.id, req.body.status),
  );

  r.post(
    '/insights/refresh',
    {
      ...base,
      schema: { tags: ['insights'], response: { 200: insightRefreshSchema, ...errors } },
    },
    (req) => {
      const { userId, today } = authed(req);
      return insights.refresh(userId, today);
    },
  );

  r.get(
    '/nutrition/energy-estimates',
    {
      ...base,
      schema: { tags: ['nutrition'], response: { 200: energyEstimatesSchema, ...errors } },
    },
    (req) => energy.list(authed(req).userId),
  );

  r.post(
    '/nutrition/energy-estimates/refresh',
    {
      ...base,
      schema: {
        tags: ['nutrition'],
        response: { 200: energyEstimateSchema.nullable(), ...errors },
      },
    },
    (req) => {
      const { userId, today } = authed(req);
      return energy.refresh(userId, today);
    },
  );
}
