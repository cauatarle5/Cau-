import { randomUUID } from 'node:crypto';

import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';

import type { Database } from '@atlas/db';

import type { AppConfig } from './config.js';
import { authRoutes, createAuthRepository, createAuthService } from './modules/auth/index.js';
import { healthRoutes } from './modules/health/index.js';
import { errorsPlugin } from './plugins/errors.js';
import { securityPlugin } from './plugins/security.js';

export interface BuildAppOptions {
  config: AppConfig;
  db: Database;
}

const REQUEST_ID_PATTERN = /^[\w-]{1,64}$/;

export async function buildApp({ config, db }: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: ['req.headers.cookie', 'res.headers["set-cookie"]'],
    },
    // Só confia em proxy local (o rewrite do Next em dev); revisar no deploy (ADR-007).
    trustProxy: 'loopback',
    logController: new LogController({ requestIdLogLabel: 'request_id' }),
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
        ? incoming
        : randomUUID();
    },
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.addHook('onSend', async (request, reply) => {
    void reply.header('x-request-id', request.id);
  });

  await app.register(errorsPlugin);
  await app.register(securityPlugin, { webOrigin: config.webOrigin });

  if (config.nodeEnv === 'development') {
    await app.register(swagger, {
      openapi: { info: { title: 'Atlas API', version: '1.0.0' } },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi, { routePrefix: '/api/docs' });
  }

  const authService = createAuthService(createAuthRepository(db));

  await app.register(
    (v1, _opts, done) => {
      healthRoutes(v1, { db });
      authRoutes(v1, {
        service: authService,
        cookieSecure: config.cookieSecure,
        rateLimitMax: config.authRateLimitMax,
      });
      done();
    },
    { prefix: '/api/v1' },
  );

  return app;
}
