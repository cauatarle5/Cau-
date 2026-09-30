import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  dayPlanSchema,
  idParamSchema,
  mealCopySchema,
  mealListQuerySchema,
  mealListResponseSchema,
  mealLogSchema,
  mealSchema,
  mealTemplateInputSchema,
  mealTemplateListSchema,
  mealTemplateSchema,
  problemDetailsSchema,
  substitutionListSchema,
  substitutionRequestSchema,
  suggestMealRequestSchema,
  suggestMealSchema,
} from '@atlas/schemas';

import { authed } from '../../lib/request';
import type { MealsService } from '../nutrition/meals';

import type { MealPlansService } from './service';

const errors = {
  400: problemDetailsSchema,
  401: problemDetailsSchema,
  404: problemDetailsSchema,
  422: problemDetailsSchema,
};

export function mealPlansRoutes(
  app: FastifyInstance,
  opts: { service: MealPlansService; meals: MealsService },
) {
  const { service, meals } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const base = { preHandler: app.requireAuth };
  const create = { preHandler: [app.requireAuth, app.idempotent] };

  r.post(
    '/meals/:id/log',
    {
      ...base,
      schema: {
        tags: ['meals'],
        params: idParamSchema,
        body: mealLogSchema,
        response: { 200: mealSchema, ...errors },
      },
    },
    (req) => meals.log(authed(req).userId, req.params.id, req.body.eatenAt),
  );

  r.post(
    '/meals/copy',
    {
      ...create,
      schema: {
        tags: ['meals'],
        body: mealCopySchema,
        response: { 201: mealListResponseSchema, ...errors },
      },
    },
    async (req, reply) =>
      reply.status(201).send({ items: await service.copy(authed(req).userId, req.body) }),
  );

  r.get(
    '/meal-templates',
    { ...base, schema: { tags: ['meals'], response: { 200: mealTemplateListSchema, ...errors } } },
    async (req) => ({ items: await service.listTemplates(authed(req).userId) }),
  );

  r.post(
    '/meal-templates',
    {
      ...create,
      schema: {
        tags: ['meals'],
        body: mealTemplateInputSchema,
        response: { 201: mealTemplateSchema, ...errors },
      },
    },
    async (req, reply) =>
      reply.status(201).send(await service.createTemplate(authed(req).userId, req.body)),
  );

  r.delete(
    '/meal-templates/:id',
    {
      ...base,
      schema: { tags: ['meals'], params: idParamSchema, response: { 204: z.null(), ...errors } },
    },
    async (req, reply) => {
      await service.removeTemplate(authed(req).userId, req.params.id);
      return reply.status(204).send(null);
    },
  );

  r.get(
    '/nutrition/day-plan',
    {
      ...base,
      schema: {
        tags: ['nutrition'],
        querystring: mealListQuerySchema,
        response: { 200: dayPlanSchema, ...errors },
      },
    },
    (req) => {
      const { userId, today } = authed(req);
      return service.dayPlan(userId, req.query.date, today);
    },
  );

  r.post(
    '/nutrition/substitutions',
    {
      ...base,
      schema: {
        tags: ['nutrition'],
        body: substitutionRequestSchema,
        response: { 200: substitutionListSchema, ...errors },
      },
    },
    (req) => service.substitutions(authed(req).userId, req.body.itemId, req.body.nutrient),
  );

  r.post(
    '/nutrition/suggest-meal',
    {
      ...base,
      schema: {
        tags: ['nutrition'],
        body: suggestMealRequestSchema,
        response: { 200: suggestMealSchema, ...errors },
      },
    },
    (req) => {
      const { userId, today } = authed(req);
      return service.suggest(userId, req.body, today);
    },
  );
}
