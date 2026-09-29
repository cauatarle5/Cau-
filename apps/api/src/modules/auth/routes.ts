import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  authUserResponseSchema,
  loginInputSchema,
  problemDetailsSchema,
  registerInputSchema,
} from '@atlas/schemas';

import { AppError, unauthorized } from '../../lib/errors.js';

import type { AuthContext, AuthService, ClientInfo } from './service.js';
import { SESSION_COOKIE } from './tokens.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export interface AuthRoutesOptions {
  service: AuthService;
  cookieSecure: boolean;
  rateLimitMax: number;
}

const RATE_WINDOW_MS = 60_000;

function clientInfo(request: FastifyRequest): ClientInfo {
  return { userAgent: request.headers['user-agent'] ?? null, ip: request.ip };
}

export function authRoutes(app: FastifyInstance, opts: AuthRoutesOptions) {
  const { service, cookieSecure } = opts;
  const limit = { max: opts.rateLimitMax, timeWindow: RATE_WINDOW_MS };
  const r = app.withTypeProvider<ZodTypeProvider>();

  const setSessionCookie = (reply: FastifyReply, token: string, expiresAt: Date) =>
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });

  const clearSessionCookie = (reply: FastifyReply) =>
    reply.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: 'lax',
      path: '/',
    });

  /** Resolve o cookie de sessão em `request.auth` (sem exigir). */
  async function resolveAuth(request: FastifyRequest, reply: FastifyReply) {
    const token = request.cookies[SESSION_COOKIE];
    request.auth = token ? await service.authenticate(token) : null;
    if (token && request.auth?.renewedExpiresAt) {
      setSessionCookie(reply, token, request.auth.renewedExpiresAt);
    }
  }

  /** preHandler para rotas autenticadas. */
  async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
    await resolveAuth(request, reply);
    if (!request.auth) throw unauthorized();
  }

  app.decorateRequest('auth', null);
  app.decorate('requireAuth', requireAuth);

  const emailLimiter = app.createRateLimit({
    ...limit,
    keyGenerator: (req) => {
      const body = req.body as { email?: unknown } | undefined;
      return `login-email:${typeof body?.email === 'string' ? body.email : ''}`;
    },
  });

  const errorResponses = {
    400: problemDetailsSchema,
    401: problemDetailsSchema,
    429: problemDetailsSchema,
  };

  r.post(
    '/auth/register',
    {
      config: { rateLimit: limit },
      schema: {
        tags: ['auth'],
        body: registerInputSchema,
        response: { 201: authUserResponseSchema, 409: problemDetailsSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const issued = await service.register(request.body, clientInfo(request));
      setSessionCookie(reply, issued.token, issued.expiresAt);
      return reply.status(201).send({ user: issued.user });
    },
  );

  r.post(
    '/auth/login',
    {
      config: { rateLimit: limit },
      preHandler: async (request) => {
        const result = await emailLimiter(request);
        // `isAllowed` só é true para allowList; o limite é indicado por `isExceeded`.
        if (!result.isAllowed && result.isExceeded) {
          throw new AppError(
            429,
            'RATE_LIMITED',
            'Muitas tentativas',
            'Aguarde um minuto e tente novamente.',
          );
        }
      },
      schema: {
        tags: ['auth'],
        body: loginInputSchema,
        response: { 200: authUserResponseSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const issued = await service.login(request.body, clientInfo(request));
      setSessionCookie(reply, issued.token, issued.expiresAt);
      return { user: issued.user };
    },
  );

  r.post(
    '/auth/logout',
    { schema: { tags: ['auth'], response: { 204: z.null() } } },
    async (request, reply) => {
      // Idempotente: sem sessão válida, apenas limpa o cookie.
      await resolveAuth(request, reply);
      if (request.auth) await service.logout(request.auth);
      clearSessionCookie(reply);
      return reply.status(204).send(null);
    },
  );

  r.get(
    '/auth/me',
    {
      preHandler: requireAuth,
      schema: {
        tags: ['auth'],
        response: { 200: authUserResponseSchema, 401: problemDetailsSchema },
      },
    },
    (request) => {
      if (!request.auth) throw unauthorized();
      return { user: request.auth.user };
    },
  );
}

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
