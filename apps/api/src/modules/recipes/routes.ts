import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  idParamSchema,
  problemDetailsSchema,
  recipeInputSchema,
  recipeListSchema,
  recipePatchSchema,
  recipeSchema,
} from '@atlas/schemas';

import { authed } from '../../lib/request';

import type { RecipesService } from './service';

const errors = {
  400: problemDetailsSchema,
  401: problemDetailsSchema,
  404: problemDetailsSchema,
  422: problemDetailsSchema,
};

export function recipesRoutes(app: FastifyInstance, opts: { service: RecipesService }) {
  const { service } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const base = { preHandler: app.requireAuth };
  const create = { preHandler: [app.requireAuth, app.idempotent] };

  r.get(
    '/recipes',
    { ...base, schema: { tags: ['recipes'], response: { 200: recipeListSchema, ...errors } } },
    async (req) => ({ items: await service.list(authed(req).userId) }),
  );

  r.get(
    '/recipes/:id',
    {
      ...base,
      schema: {
        tags: ['recipes'],
        params: idParamSchema,
        response: { 200: recipeSchema, ...errors },
      },
    },
    (req) => service.get(authed(req).userId, req.params.id),
  );

  r.post(
    '/recipes',
    {
      ...create,
      schema: {
        tags: ['recipes'],
        body: recipeInputSchema,
        response: { 201: recipeSchema, ...errors },
      },
    },
    async (req, reply) =>
      reply.status(201).send(await service.create(authed(req).userId, req.body)),
  );

  r.patch(
    '/recipes/:id',
    {
      ...base,
      schema: {
        tags: ['recipes'],
        params: idParamSchema,
        body: recipePatchSchema,
        response: { 200: recipeSchema, ...errors },
      },
    },
    (req) => service.update(authed(req).userId, req.params.id, req.body),
  );

  r.post(
    '/recipes/:id/duplicate',
    {
      ...create,
      schema: {
        tags: ['recipes'],
        params: idParamSchema,
        response: { 201: recipeSchema, ...errors },
      },
    },
    async (req, reply) =>
      reply.status(201).send(await service.duplicate(authed(req).userId, req.params.id)),
  );

  r.delete(
    '/recipes/:id',
    {
      ...base,
      schema: { tags: ['recipes'], params: idParamSchema, response: { 204: z.null(), ...errors } },
    },
    async (req, reply) => {
      await service.remove(authed(req).userId, req.params.id);
      return reply.status(204).send(null);
    },
  );
}
