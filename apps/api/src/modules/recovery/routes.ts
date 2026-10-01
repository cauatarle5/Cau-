import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  activityInputSchema,
  activityListSchema,
  activityPatchSchema,
  activitySchema,
  checkinPutSchema,
  checkinSchema,
  dayParamSchema,
  idParamSchema,
  painReportInputSchema,
  painReportSchema,
  problemDetailsSchema,
  rangeQuerySchema,
  recoveryLoadSchema,
} from '@atlas/schemas';

import { authed } from '../../lib/request';

import type { RecoveryService } from './service';

const errors = { 400: problemDetailsSchema, 401: problemDetailsSchema, 404: problemDetailsSchema };

export function recoveryRoutes(app: FastifyInstance, opts: { service: RecoveryService }) {
  const { service } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const base = { preHandler: app.requireAuth };
  const create = { preHandler: [app.requireAuth, app.idempotent] };

  r.get(
    '/activities',
    {
      ...base,
      schema: {
        tags: ['recovery'],
        querystring: rangeQuerySchema,
        response: { 200: activityListSchema, ...errors },
      },
    },
    async (req) => ({
      items: await service.listActivities(authed(req).userId, req.query.from, req.query.to),
    }),
  );

  r.post(
    '/activities',
    {
      ...create,
      schema: {
        tags: ['recovery'],
        body: activityInputSchema,
        response: { 201: activitySchema, ...errors },
      },
    },
    async (req, reply) =>
      reply.status(201).send(await service.createActivity(authed(req).userId, req.body)),
  );

  r.patch(
    '/activities/:id',
    {
      ...base,
      schema: {
        tags: ['recovery'],
        params: idParamSchema,
        body: activityPatchSchema,
        response: { 200: activitySchema, ...errors },
      },
    },
    (req) => service.updateActivity(authed(req).userId, req.params.id, req.body),
  );

  r.delete(
    '/activities/:id',
    {
      ...base,
      schema: { tags: ['recovery'], params: idParamSchema, response: { 204: z.null(), ...errors } },
    },
    async (req, reply) => {
      await service.deleteActivity(authed(req).userId, req.params.id);
      return reply.status(204).send(null);
    },
  );

  r.get(
    '/checkins/:date',
    {
      ...base,
      schema: {
        tags: ['recovery'],
        params: dayParamSchema,
        response: { 200: checkinSchema, ...errors },
      },
    },
    (req) => service.getCheckin(authed(req).userId, req.params.date),
  );

  r.put(
    '/checkins/:date',
    {
      ...base,
      schema: {
        tags: ['recovery'],
        params: dayParamSchema,
        body: checkinPutSchema,
        response: { 200: checkinSchema, ...errors },
      },
    },
    (req) => service.putCheckin(authed(req).userId, req.params.date, req.body),
  );

  r.post(
    '/pain-reports',
    {
      ...create,
      schema: {
        tags: ['recovery'],
        body: painReportInputSchema,
        response: { 201: painReportSchema, ...errors },
      },
    },
    async (req, reply) =>
      reply.status(201).send(await service.createPain(authed(req).userId, req.body)),
  );

  r.get(
    '/recovery/load',
    {
      ...base,
      schema: {
        tags: ['recovery'],
        querystring: rangeQuerySchema,
        response: { 200: recoveryLoadSchema, ...errors },
      },
    },
    async (req) => ({
      items: await service.loadRange(authed(req).userId, req.query.from, req.query.to),
    }),
  );
}
