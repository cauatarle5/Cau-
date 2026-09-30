import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import {
  customFoodInputSchema,
  foodSchema,
  foodSearchQuerySchema,
  foodSearchResponseSchema,
  idParamSchema,
  measureInputSchema,
  problemDetailsSchema,
} from '@atlas/schemas';

import { authed } from '../../lib/request';

import type { FoodsService } from './service';

const errors = { 400: problemDetailsSchema, 401: problemDetailsSchema, 404: problemDetailsSchema };

export function foodsRoutes(app: FastifyInstance, opts: { service: FoodsService }) {
  const { service } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const base = { preHandler: app.requireAuth };

  r.get(
    '/foods/search',
    {
      ...base,
      schema: {
        tags: ['foods'],
        querystring: foodSearchQuerySchema,
        response: { 200: foodSearchResponseSchema, ...errors },
      },
    },
    async (req) => ({
      items: await service.search(authed(req).userId, req.query.q, req.query.limit),
    }),
  );

  r.get(
    '/foods/:id',
    {
      ...base,
      schema: { tags: ['foods'], params: idParamSchema, response: { 200: foodSchema, ...errors } },
    },
    (req) => service.get(authed(req).userId, req.params.id),
  );

  r.post(
    '/foods',
    {
      ...base,
      schema: {
        tags: ['foods'],
        body: customFoodInputSchema,
        response: { 201: foodSchema, ...errors },
      },
    },
    async (req, reply) =>
      reply.status(201).send(await service.createCustom(authed(req).userId, req.body)),
  );

  r.post(
    '/foods/:id/measures',
    {
      ...base,
      schema: {
        tags: ['foods'],
        params: idParamSchema,
        body: measureInputSchema,
        response: { 201: foodSchema, ...errors },
      },
    },
    async (req, reply) =>
      reply.status(201).send(await service.addMeasure(authed(req).userId, req.params.id, req.body)),
  );
}
