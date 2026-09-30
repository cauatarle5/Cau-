import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { FoodParser } from '@atlas/ai';
import { daysBetween } from '@atlas/core';
import {
  dateRangeQuerySchema,
  dayParamSchema,
  daySummarySchema,
  dayTypePutSchema,
  idParamSchema,
  mealCreateSchema,
  mealItemInputSchema,
  mealItemPatchSchema,
  mealListQuerySchema,
  mealListSchema,
  mealListQuerySchema as dateQuerySchema,
  mealPatchSchema,
  mealSchema,
  parseRequestSchema,
  parseResponseSchema,
  problemDetailsSchema,
  targetsResponseSchema,
  waterLogInputSchema,
  waterLogSchema,
} from '@atlas/schemas';

import { AppError, validationError } from '../../lib/errors';
import { authed } from '../../lib/request';
import type { FoodsService } from '../foods/service';

import type { MealsService } from './meals';
import type { NutritionService } from './service';

export const MAX_TARGET_RANGE_DAYS = 92;

const errors = {
  400: problemDetailsSchema,
  401: problemDetailsSchema,
  404: problemDetailsSchema,
  422: problemDetailsSchema,
  429: problemDetailsSchema,
};

export interface NutritionRoutesOptions {
  service: NutritionService;
  meals: MealsService;
  foods: FoodsService;
  parser: FoodParser;
  aiRateLimitMax: number;
}

export function nutritionRoutes(app: FastifyInstance, opts: NutritionRoutesOptions) {
  const { service, meals, foods, parser } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const base = { preHandler: app.requireAuth };

  // Endpoints de IA: limite por usuário (P3.4, padrão 30/min).
  const aiLimiter = app.createRateLimit({
    max: opts.aiRateLimitMax,
    timeWindow: 60_000,
    keyGenerator: (req) => `ai:${req.auth?.userId ?? req.ip}`,
  });
  const aiLimit = async (req: FastifyRequest, reply: FastifyReply) => {
    const result = await aiLimiter(req);
    if (!result.isAllowed && result.isExceeded) {
      void reply.header('retry-after', String(result.ttlInSeconds));
      throw new AppError(
        429,
        'RATE_LIMITED',
        'Muitas tentativas',
        'Aguarde um minuto e tente novamente.',
      );
    }
  };

  r.get(
    '/nutrition/targets',
    {
      ...base,
      schema: {
        tags: ['nutrition'],
        querystring: dateRangeQuerySchema,
        response: { 200: targetsResponseSchema, ...errors },
      },
    },
    (req) => {
      const { userId, today } = authed(req);
      const { from, to } = req.query;
      if (daysBetween(from, to) >= MAX_TARGET_RANGE_DAYS) {
        throw validationError([
          { field: 'to', message: `Período máximo de ${String(MAX_TARGET_RANGE_DAYS)} dias` },
        ]);
      }
      return service.targets(userId, from, to, today);
    },
  );

  r.put(
    '/nutrition/targets/:date/day-type',
    {
      ...base,
      schema: {
        tags: ['nutrition'],
        params: dayParamSchema,
        body: dayTypePutSchema,
        response: { 200: targetsResponseSchema, ...errors },
      },
    },
    (req) => {
      const { userId, today } = authed(req);
      return service.setDayType(userId, req.params.date, req.body.dayType, today);
    },
  );

  r.get(
    '/nutrition/day-summary',
    {
      ...base,
      schema: {
        tags: ['nutrition'],
        querystring: dateQuerySchema,
        response: { 200: daySummarySchema, ...errors },
      },
    },
    (req) => {
      const { userId, today } = authed(req);
      return meals.summary(userId, req.query.date, today);
    },
  );

  r.post(
    '/nutrition/parse',
    {
      preHandler: [app.requireAuth, aiLimit],
      schema: {
        tags: ['nutrition'],
        body: parseRequestSchema,
        response: { 200: parseResponseSchema, ...errors },
      },
    },
    async (req) => {
      const { userId } = authed(req);
      const parsed = await parser.parse(req.body.text);
      const matched = await foods.matchItems(userId, parsed.items);
      return { source: parsed.source, ...matched };
    },
  );

  r.get(
    '/meals',
    {
      ...base,
      schema: {
        tags: ['meals'],
        querystring: mealListQuerySchema,
        response: { 200: mealListSchema, ...errors },
      },
    },
    async (req) => ({ items: await meals.list(authed(req).userId, req.query.date) }),
  );

  r.post(
    '/meals',
    {
      ...base,
      schema: { tags: ['meals'], body: mealCreateSchema, response: { 201: mealSchema, ...errors } },
    },
    async (req, reply) => reply.status(201).send(await meals.create(authed(req).userId, req.body)),
  );

  r.patch(
    '/meals/:id',
    {
      ...base,
      schema: {
        tags: ['meals'],
        params: idParamSchema,
        body: mealPatchSchema,
        response: { 200: mealSchema, ...errors },
      },
    },
    (req) => meals.update(authed(req).userId, req.params.id, req.body),
  );

  r.post(
    '/meals/:id/items',
    {
      ...base,
      schema: {
        tags: ['meals'],
        params: idParamSchema,
        body: z.object({ items: z.array(mealItemInputSchema).min(1).max(30) }),
        response: { 201: mealSchema, ...errors },
      },
    },
    async (req, reply) =>
      reply
        .status(201)
        .send(await meals.addItems(authed(req).userId, req.params.id, req.body.items)),
  );

  r.patch(
    '/meal-items/:id',
    {
      ...base,
      schema: {
        tags: ['meals'],
        params: idParamSchema,
        body: mealItemPatchSchema,
        response: { 200: mealSchema, ...errors },
      },
    },
    (req) => meals.updateItem(authed(req).userId, req.params.id, req.body),
  );

  r.delete(
    '/meal-items/:id',
    {
      ...base,
      schema: { tags: ['meals'], params: idParamSchema, response: { 204: z.null(), ...errors } },
    },
    async (req, reply) => {
      await meals.deleteItem(authed(req).userId, req.params.id);
      return reply.status(204).send(null);
    },
  );

  r.post(
    '/water-logs',
    {
      ...base,
      schema: {
        tags: ['nutrition'],
        body: waterLogInputSchema,
        response: { 201: waterLogSchema, ...errors },
      },
    },
    async (req, reply) => {
      const { userId } = authed(req);
      return reply.status(201).send(await meals.addWater(userId, req.body.date, req.body.ml));
    },
  );
}
