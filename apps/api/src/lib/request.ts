import type { FastifyRequest } from 'fastify';

import { localDate } from '@atlas/core';

import { unauthorized } from './errors';

/** Contexto do usuário autenticado (use após `requireAuth`). */
export function authed(request: FastifyRequest) {
  if (!request.auth) throw unauthorized();
  const { userId, user } = request.auth;
  return { userId, timezone: user.timezone, today: localDate(new Date(), user.timezone) };
}
