import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  bodyMeasurementCreateResponseSchema,
  bodyMeasurementInputSchema,
  bodyMeasurementListSchema,
  bodyMeasurementPatchSchema,
  bodyMeasurementSchema,
  bodyTrendResponseSchema,
  dateRangeQuerySchema,
  idParamSchema,
  paginationQuerySchema,
  problemDetailsSchema,
} from '@atlas/schemas';

import { authed } from '../../lib/request';

import type { BodyService } from './service';

const errors = { 400: problemDetailsSchema, 401: problemDetailsSchema, 404: problemDetailsSchema };

export function bodyRoutes(app: FastifyInstance, opts: { service: BodyService }) {
  const { service } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const base = { preHandler: app.requireAuth };

  r.get(
    '/body-measurements',
    {
      ...base,
      schema: {
        tags: ['body'],
        querystring: paginationQuerySchema,
        response: { 200: bodyMeasurementListSchema, ...errors },
      },
    },
    (req) => service.list(authed(req).userId, req.query.limit, req.query.cursor),
  );

  r.post(
    '/body-measurements',
    {
      ...base,
      schema: {
        tags: ['body'],
        body: bodyMeasurementInputSchema,
        response: { 201: bodyMeasurementCreateResponseSchema, ...errors },
      },
    },
    async (req, reply) => {
      const { userId, today } = authed(req);
      return reply.status(201).send(await service.create(userId, req.body, today));
    },
  );

  r.patch(
    '/body-measurements/:id',
    {
      ...base,
      schema: {
        tags: ['body'],
        params: idParamSchema,
        body: bodyMeasurementPatchSchema,
        response: { 200: bodyMeasurementSchema, ...errors },
      },
    },
    (req) => {
      const { userId, today } = authed(req);
      return service.update(userId, req.params.id, req.body, today);
    },
  );

  r.delete(
    '/body-measurements/:id',
    {
      ...base,
      schema: { tags: ['body'], params: idParamSchema, response: { 204: z.null(), ...errors } },
    },
    async (req, reply) => {
      await service.remove(authed(req).userId, req.params.id);
      return reply.status(204).send(null);
    },
  );

  r.get(
    '/body/trend',
    {
      ...base,
      schema: {
        tags: ['body'],
        querystring: dateRangeQuerySchema,
        response: { 200: bodyTrendResponseSchema, ...errors },
      },
    },
    (req) => service.trend(authed(req).userId, req.query.from, req.query.to),
  );
}
