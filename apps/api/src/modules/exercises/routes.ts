import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  customExerciseInputSchema,
  exerciseListSchema,
  exercisePreferencesPutSchema,
  exercisePreferencesSchema,
  exerciseSchema,
  exerciseSearchQuerySchema,
  idParamSchema,
  problemDetailsSchema,
} from '@atlas/schemas';

import { authed } from '../../lib/request';

import type { ExercisesService } from './service';

const errors = { 400: problemDetailsSchema, 401: problemDetailsSchema, 404: problemDetailsSchema };

export function exercisesRoutes(app: FastifyInstance, opts: { service: ExercisesService }) {
  const { service } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const base = { preHandler: app.requireAuth };

  r.get(
    '/exercises',
    {
      ...base,
      schema: {
        tags: ['exercises'],
        querystring: exerciseSearchQuerySchema,
        response: { 200: exerciseListSchema, ...errors },
      },
    },
    async (req) => ({ items: await service.search(authed(req).userId, req.query) }),
  );

  r.get(
    '/exercises/:id',
    {
      ...base,
      schema: {
        tags: ['exercises'],
        params: idParamSchema,
        response: { 200: exerciseSchema, ...errors },
      },
    },
    (req) => service.get(authed(req).userId, req.params.id),
  );

  r.get(
    '/exercises/:id/alternatives',
    {
      ...base,
      schema: {
        tags: ['exercises'],
        params: idParamSchema,
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }),
        response: { 200: exerciseListSchema, ...errors },
      },
    },
    async (req) => ({
      items: await service.alternatives(authed(req).userId, req.params.id, req.query.limit),
    }),
  );

  r.post(
    '/exercises',
    {
      preHandler: [app.requireAuth, app.idempotent],
      schema: {
        tags: ['exercises'],
        body: customExerciseInputSchema,
        response: { 201: exerciseSchema, ...errors },
      },
    },
    async (req, reply) =>
      reply.status(201).send(await service.createCustom(authed(req).userId, req.body)),
  );

  r.get(
    '/exercise-preferences',
    {
      ...base,
      schema: { tags: ['exercises'], response: { 200: exercisePreferencesSchema, ...errors } },
    },
    (req) => service.listPreferences(authed(req).userId),
  );

  r.put(
    '/exercise-preferences',
    {
      ...base,
      schema: {
        tags: ['exercises'],
        body: exercisePreferencesPutSchema,
        response: { 200: exercisePreferencesSchema, ...errors },
      },
    },
    (req) => service.putPreferences(authed(req).userId, req.body),
  );
}
