import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  availabilityPutSchema,
  availabilityResponseSchema,
  equipmentPutSchema,
  equipmentResponseSchema,
  goalCreateResponseSchema,
  goalInputSchema,
  goalListSchema,
  idParamSchema,
  limitationInputSchema,
  limitationListSchema,
  limitationPatchSchema,
  limitationSchema,
  problemDetailsSchema,
  profileInputSchema,
  profileResponseSchema,
  sportsPutSchema,
  sportsResponseSchema,
} from '@atlas/schemas';

import { authed } from '../../lib/request';
import type { NutritionService } from '../nutrition/service';

import type { ProfileService } from './service';

const errors = { 400: problemDetailsSchema, 401: problemDetailsSchema, 404: problemDetailsSchema };

export function profileRoutes(
  app: FastifyInstance,
  opts: { service: ProfileService; nutrition: NutritionService },
) {
  const { service, nutrition } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const base = { preHandler: app.requireAuth };

  r.get(
    '/profile',
    { ...base, schema: { tags: ['profile'], response: { 200: profileResponseSchema, ...errors } } },
    async (req) => {
      const { userId } = authed(req);
      const [profile, onboardingComplete] = await Promise.all([
        service.getProfile(userId),
        service.onboardingComplete(userId),
      ]);
      return { profile, onboardingComplete };
    },
  );

  r.put(
    '/profile',
    {
      ...base,
      schema: {
        tags: ['profile'],
        body: profileInputSchema,
        response: { 200: profileResponseSchema, ...errors },
      },
    },
    async (req) => {
      const { userId } = authed(req);
      const profile = await service.putProfile(userId, req.body);
      return { profile, onboardingComplete: await service.onboardingComplete(userId) };
    },
  );

  r.get(
    '/availability',
    {
      ...base,
      schema: { tags: ['profile'], response: { 200: availabilityResponseSchema, ...errors } },
    },
    async (req) => ({
      items: await service.listAvailability(authed(req).userId),
    }),
  );

  r.put(
    '/availability',
    {
      ...base,
      schema: {
        tags: ['profile'],
        body: availabilityPutSchema,
        response: { 200: availabilityResponseSchema, ...errors },
      },
    },
    async (req) => {
      const { userId } = authed(req);
      await service.putAvailability(userId, req.body.items);
      return { items: await service.listAvailability(userId) };
    },
  );

  r.get(
    '/equipment',
    {
      ...base,
      schema: { tags: ['profile'], response: { 200: equipmentResponseSchema, ...errors } },
    },
    (req) => service.getEquipment(authed(req).userId),
  );

  r.put(
    '/equipment',
    {
      ...base,
      schema: {
        tags: ['profile'],
        body: equipmentPutSchema,
        response: { 200: equipmentResponseSchema, ...errors },
      },
    },
    async (req) => {
      const { userId } = authed(req);
      await service.putEquipment(userId, req.body.items);
      return service.getEquipment(userId);
    },
  );

  r.get(
    '/limitations',
    { ...base, schema: { tags: ['profile'], response: { 200: limitationListSchema, ...errors } } },
    async (req) => ({
      items: await service.listLimitations(authed(req).userId),
    }),
  );

  r.post(
    '/limitations',
    {
      ...base,
      schema: {
        tags: ['profile'],
        body: limitationInputSchema,
        response: { 201: limitationSchema, ...errors },
      },
    },
    async (req, reply) =>
      reply.status(201).send(await service.createLimitation(authed(req).userId, req.body)),
  );

  r.patch(
    '/limitations/:id',
    {
      ...base,
      schema: {
        tags: ['profile'],
        params: idParamSchema,
        body: limitationPatchSchema,
        response: { 200: limitationSchema, ...errors },
      },
    },
    (req) => service.updateLimitation(authed(req).userId, req.params.id, req.body),
  );

  r.delete(
    '/limitations/:id',
    {
      ...base,
      schema: { tags: ['profile'], params: idParamSchema, response: { 204: z.null(), ...errors } },
    },
    async (req, reply) => {
      await service.deleteLimitation(authed(req).userId, req.params.id);
      return reply.status(204).send(null);
    },
  );

  r.get(
    '/sports',
    { ...base, schema: { tags: ['profile'], response: { 200: sportsResponseSchema, ...errors } } },
    async (req) => ({
      items: await service.listSports(authed(req).userId),
    }),
  );

  r.put(
    '/sports',
    {
      ...base,
      schema: {
        tags: ['profile'],
        body: sportsPutSchema,
        response: { 200: sportsResponseSchema, ...errors },
      },
    },
    async (req) => {
      const { userId } = authed(req);
      await service.putSports(userId, req.body.items);
      return { items: await service.listSports(userId) };
    },
  );

  r.get(
    '/goals',
    { ...base, schema: { tags: ['profile'], response: { 200: goalListSchema, ...errors } } },
    async (req) => ({
      items: await service.listGoals(authed(req).userId),
    }),
  );

  r.post(
    '/goals',
    {
      ...base,
      schema: {
        tags: ['profile'],
        body: goalInputSchema,
        response: { 201: goalCreateResponseSchema, ...errors },
      },
    },
    async (req, reply) => {
      const { userId, today } = authed(req);
      const goal = await service.createGoal(userId, req.body, today);
      const targets = await nutrition.targets(userId, today, today, today);
      return reply.status(201).send({ goal, targets });
    },
  );
}
