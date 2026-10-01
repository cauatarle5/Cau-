import { randomUUID } from 'node:crypto';

import Anthropic from '@anthropic-ai/sdk';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';

import {
  anthropicTransport,
  createFoodParser,
  scriptedTransport,
  type CoachTransport,
  type FoodParser,
} from '@atlas/ai';
import type { Database } from '@atlas/db';

import type { AppConfig } from './config';
import { startJobs } from './jobs/worker';
import { accountRoutes, createAccountRepository, createAccountService } from './modules/account';
import { analyticsRoutes } from './modules/analytics';
import { authRoutes } from './modules/auth/index';
import { bodyRoutes } from './modules/body';
import { coachRoutes, createCoachRepository, createCoachService } from './modules/coach';
import { exercisesRoutes } from './modules/exercises';
import { foodsRoutes } from './modules/foods';
import { healthRoutes } from './modules/health/index';
import { insightsRoutes } from './modules/insights';
import { mealPlansRoutes } from './modules/meal-plans';
import { nutritionRoutes } from './modules/nutrition';
import { profileRoutes } from './modules/profile';
import { recipesRoutes } from './modules/recipes';
import { recoveryRoutes } from './modules/recovery';
import { trainingRoutes } from './modules/training';
import { errorsPlugin } from './plugins/errors';
import { idempotencyPlugin } from './plugins/idempotency';
import { securityPlugin } from './plugins/security';
import { createServices } from './services';

export interface BuildAppOptions {
  config: AppConfig;
  db: Database;
  /** Permite injetar um parser falso nos testes. */
  parser?: FoodParser;
  /** Transporte do Coach para testes (`null` = IA indisponível). */
  coachTransport?: CoachTransport | null;
}

const REQUEST_ID_PATTERN = /^[\w-]{1,64}$/;

export async function buildApp({
  config,
  db,
  parser,
  coachTransport,
}: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: ['req.headers.cookie', 'res.headers["set-cookie"]'],
    },
    // Padrão: só o proxy local (rewrite do Next em dev); configurar no deploy (ADR-014).
    trustProxy: config.trustProxy,
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
  await app.register(idempotencyPlugin, { db });

  if (config.nodeEnv === 'development') {
    await app.register(swagger, {
      openapi: { info: { title: 'Atlas API', version: '1.0.0' } },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi, { routePrefix: '/api/docs' });
  }

  const svc = createServices(db);
  const foodParser =
    parser ??
    createFoodParser({
      model: config.aiModelFast,
      apiKey: config.anthropicApiKey,
      onError: (err) => {
        app.log.warn({ err }, 'ai parser failed; falling back to rules');
      },
    });
  // Coach (ADR-054/056): transporte real com chave e modelo; roteirizado só com AI_FAKE.
  const transport: CoachTransport | null =
    coachTransport !== undefined
      ? coachTransport
      : config.aiFake
        ? scriptedTransport()
        : config.anthropicApiKey && config.aiModelChat
          ? anthropicTransport(new Anthropic({ apiKey: config.anthropicApiKey }))
          : null;
  const coach = createCoachService({
    repo: createCoachRepository(db),
    svc,
    parser: foodParser,
    config: {
      transport,
      model: transport
        ? config.aiFake && coachTransport === undefined
          ? 'scripted'
          : (config.aiModelChat ?? 'test')
        : null,
      dailyTokenLimit: config.aiDailyTokenLimit,
    },
  });

  await app.register(
    (v1, _opts, done) => {
      healthRoutes(v1, { db });
      authRoutes(v1, {
        service: svc.auth,
        cookieSecure: config.cookieSecure,
        rateLimitMax: config.authRateLimitMax,
      });
      accountRoutes(v1, {
        service: createAccountService(createAccountRepository(db)),
        cookieSecure: config.cookieSecure,
        rateLimitMax: config.authRateLimitMax,
      });
      profileRoutes(v1, { service: svc.profile, nutrition: svc.nutrition });
      bodyRoutes(v1, { service: svc.body });
      foodsRoutes(v1, { service: svc.foods });
      nutritionRoutes(v1, {
        service: svc.nutrition,
        meals: svc.meals,
        foods: svc.foods,
        parser: foodParser,
        aiRateLimitMax: config.aiRateLimitMax,
      });
      recipesRoutes(v1, { service: svc.recipes });
      mealPlansRoutes(v1, { service: svc.mealPlans, meals: svc.meals });
      exercisesRoutes(v1, { service: svc.exercises });
      trainingRoutes(v1, { service: svc.training, agenda: svc.agenda });
      recoveryRoutes(v1, { service: svc.recovery });
      analyticsRoutes(v1, { service: svc.analytics });
      insightsRoutes(v1, {
        insights: svc.insights,
        energy: svc.energy,
        context: svc.dailyContext,
      });
      coachRoutes(v1, { service: coach, aiRateLimitMax: config.aiRateLimitMax });
      done();
    },
    { prefix: '/api/v1' },
  );

  if (config.jobsEnabled) {
    let stopJobs: (() => Promise<void>) | null = null;
    app.addHook('onReady', async () => {
      stopJobs = await startJobs(config.databaseUrl, {
        repo: svc.insightsRepo,
        energy: svc.energy,
        insights: svc.insights,
        coach,
        log: app.log,
      });
    });
    app.addHook('onClose', async () => {
      await stopJobs?.();
    });
  }

  return app;
}
