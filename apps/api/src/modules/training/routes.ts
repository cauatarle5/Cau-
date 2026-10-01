import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  adaptedQuerySchema,
  adaptedWorkoutSchema,
  plannedWorkoutListSchema,
  plannedWorkoutPatchSchema,
  plannedWorkoutSchema,
  programDraftSchema,
  programGenerateSchema,
  rangeQuerySchema,
  exerciseProgressQuerySchema,
  exerciseProgressSchema,
  idParamSchema,
  problemDetailsSchema,
  programInputSchema,
  programListSchema,
  programPatchSchema,
  programSchema,
  sessionExerciseInputSchema,
  sessionExercisePatchSchema,
  sessionListQuerySchema,
  sessionListSchema,
  sessionPatchSchema,
  sessionSchema,
  sessionStartSchema,
  setInputSchema,
  setPatchSchema,
  setResultSchema,
} from '@atlas/schemas';

import { authed } from '../../lib/request';

import type { AgendaService } from './agenda';
import type { TrainingService } from './service';

const errors = {
  400: problemDetailsSchema,
  401: problemDetailsSchema,
  404: problemDetailsSchema,
  409: problemDetailsSchema,
  422: problemDetailsSchema,
};

export function trainingRoutes(
  app: FastifyInstance,
  opts: { service: TrainingService; agenda: AgendaService },
) {
  const { service, agenda } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const base = { preHandler: app.requireAuth };
  const create = { preHandler: [app.requireAuth, app.idempotent] };

  // Programas -------------------------------------------------------------

  r.get(
    '/programs',
    { ...base, schema: { tags: ['training'], response: { 200: programListSchema, ...errors } } },
    async (req) => ({ items: await service.listPrograms(authed(req).userId) }),
  );

  r.get(
    '/programs/:id',
    {
      ...base,
      schema: {
        tags: ['training'],
        params: idParamSchema,
        response: { 200: programSchema, ...errors },
      },
    },
    (req) => service.getProgram(authed(req).userId, req.params.id),
  );

  r.post(
    '/programs',
    {
      ...create,
      schema: {
        tags: ['training'],
        body: programInputSchema,
        response: { 201: programSchema, ...errors },
      },
    },
    async (req, reply) =>
      reply.status(201).send(await service.createProgram(authed(req), req.body)),
  );

  r.post(
    '/programs/generate',
    {
      ...base,
      schema: {
        tags: ['training'],
        body: programGenerateSchema,
        response: { 200: programDraftSchema, ...errors },
      },
    },
    (req) => agenda.generate(authed(req), req.body),
  );

  r.get(
    '/planned-workouts',
    {
      ...base,
      schema: {
        tags: ['training'],
        querystring: rangeQuerySchema,
        response: { 200: plannedWorkoutListSchema, ...errors },
      },
    },
    async (req) => ({
      items: await agenda.listPlanned(authed(req).userId, req.query.from, req.query.to),
    }),
  );

  r.patch(
    '/planned-workouts/:id',
    {
      ...base,
      schema: {
        tags: ['training'],
        params: idParamSchema,
        body: plannedWorkoutPatchSchema,
        response: { 200: plannedWorkoutSchema, ...errors },
      },
    },
    (req) => agenda.patchPlanned(authed(req).userId, req.params.id, req.body),
  );

  r.get(
    '/planned-workouts/:id/adapted',
    {
      ...base,
      schema: {
        tags: ['training'],
        params: idParamSchema,
        querystring: adaptedQuerySchema,
        response: { 200: adaptedWorkoutSchema, ...errors },
      },
    },
    (req) => agenda.adapted(authed(req), req.params.id, req.query.redChoice),
  );

  r.patch(
    '/programs/:id',
    {
      ...base,
      schema: {
        tags: ['training'],
        params: idParamSchema,
        body: programPatchSchema,
        response: { 200: programSchema, ...errors },
      },
    },
    (req) => service.updateProgram(authed(req), req.params.id, req.body),
  );

  r.post(
    '/programs/:id/activate',
    {
      ...base,
      schema: {
        tags: ['training'],
        params: idParamSchema,
        response: { 200: programSchema, ...errors },
      },
    },
    (req) => service.activateProgram(authed(req), req.params.id),
  );

  // Sessões ---------------------------------------------------------------

  r.get(
    '/sessions',
    {
      ...base,
      schema: {
        tags: ['training'],
        querystring: sessionListQuerySchema,
        response: { 200: sessionListSchema, ...errors },
      },
    },
    async (req) => ({ items: await service.listSessions(authed(req), req.query) }),
  );

  r.post(
    '/sessions',
    {
      ...create,
      schema: {
        tags: ['training'],
        body: sessionStartSchema,
        response: { 200: sessionSchema, 201: sessionSchema, ...errors },
      },
    },
    async (req, reply) => {
      const { created, session } = await service.startSession(authed(req), req.body);
      return reply.status(created ? 201 : 200).send(session);
    },
  );

  r.get(
    '/sessions/:id',
    {
      ...base,
      schema: {
        tags: ['training'],
        params: idParamSchema,
        response: { 200: sessionSchema, ...errors },
      },
    },
    (req) => service.getSession(authed(req).userId, req.params.id),
  );

  r.patch(
    '/sessions/:id',
    {
      ...base,
      schema: {
        tags: ['training'],
        params: idParamSchema,
        body: sessionPatchSchema,
        response: { 200: sessionSchema, ...errors },
      },
    },
    (req) => service.patchSession(authed(req).userId, req.params.id, req.body),
  );

  r.delete(
    '/sessions/:id',
    {
      ...base,
      schema: { tags: ['training'], params: idParamSchema, response: { 204: z.null(), ...errors } },
    },
    async (req, reply) => {
      await service.deleteSession(authed(req).userId, req.params.id);
      return reply.status(204).send(null);
    },
  );

  r.post(
    '/sessions/:id/exercises',
    {
      ...create,
      schema: {
        tags: ['training'],
        params: idParamSchema,
        body: sessionExerciseInputSchema,
        response: { 200: sessionSchema, 201: sessionSchema, ...errors },
      },
    },
    async (req, reply) => {
      const { created, session } = await service.addExercise(
        authed(req).userId,
        req.params.id,
        req.body,
      );
      return reply.status(created ? 201 : 200).send(session);
    },
  );

  r.patch(
    '/session-exercises/:id',
    {
      ...base,
      schema: {
        tags: ['training'],
        params: idParamSchema,
        body: sessionExercisePatchSchema,
        response: { 200: sessionSchema, ...errors },
      },
    },
    (req) => service.patchSessionExercise(authed(req).userId, req.params.id, req.body),
  );

  // Séries ----------------------------------------------------------------

  r.post(
    '/session-exercises/:id/sets',
    {
      ...create,
      schema: {
        tags: ['training'],
        params: idParamSchema,
        body: setInputSchema,
        response: { 200: setResultSchema, 201: setResultSchema, ...errors },
      },
    },
    async (req, reply) => {
      const { created, result } = await service.createSet(
        authed(req).userId,
        req.params.id,
        req.body,
      );
      return reply.status(created ? 201 : 200).send(result);
    },
  );

  r.patch(
    '/sets/:id',
    {
      ...base,
      schema: {
        tags: ['training'],
        params: idParamSchema,
        body: setPatchSchema,
        response: { 200: setResultSchema, ...errors },
      },
    },
    (req) => service.patchSet(authed(req).userId, req.params.id, req.body),
  );

  r.delete(
    '/sets/:id',
    {
      ...base,
      schema: { tags: ['training'], params: idParamSchema, response: { 204: z.null(), ...errors } },
    },
    async (req, reply) => {
      await service.deleteSet(authed(req).userId, req.params.id);
      return reply.status(204).send(null);
    },
  );

  // Progresso -------------------------------------------------------------

  r.get(
    '/exercises/:id/progress',
    {
      ...base,
      schema: {
        tags: ['training'],
        params: idParamSchema,
        querystring: exerciseProgressQuerySchema,
        response: { 200: exerciseProgressSchema, ...errors },
      },
    },
    (req) => service.progress(authed(req), req.params.id, req.query),
  );
}
