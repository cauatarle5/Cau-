import { randomUUID } from 'node:crypto';

import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';

import { createFoodParser, type FoodParser } from '@atlas/ai';
import { sessionLoad } from '@atlas/core';
import type { Database } from '@atlas/db';

import type { AppConfig } from './config';
import { analyticsRoutes, createAnalyticsService } from './modules/analytics';
import { authRoutes, createAuthRepository, createAuthService } from './modules/auth/index';
import { bodyRoutes, createBodyRepository, createBodyService } from './modules/body';
import {
  createExercisesRepository,
  createExercisesService,
  exercisesRoutes,
} from './modules/exercises';
import { createFoodsRepository, createFoodsService, foodsRoutes } from './modules/foods';
import { healthRoutes } from './modules/health/index';
import {
  createMealPlansRepository,
  createMealPlansService,
  mealPlansRoutes,
} from './modules/meal-plans';
import {
  createMealsService,
  createNutritionRepository,
  createNutritionService,
  nutritionRoutes,
} from './modules/nutrition';
import { createProfileRepository, createProfileService, profileRoutes } from './modules/profile';
import { createRecipesRepository, createRecipesService, recipesRoutes } from './modules/recipes';
import {
  createRecoveryRepository,
  createRecoveryService,
  recoveryRoutes,
} from './modules/recovery';
import {
  createAgendaService,
  createTrainingRepository,
  createTrainingService,
  trainingRoutes,
} from './modules/training';
import { errorsPlugin } from './plugins/errors';
import { idempotencyPlugin } from './plugins/idempotency';
import { securityPlugin } from './plugins/security';

export interface BuildAppOptions {
  config: AppConfig;
  db: Database;
  /** Permite injetar um parser falso nos testes. */
  parser?: FoodParser;
}

const REQUEST_ID_PATTERN = /^[\w-]{1,64}$/;

export async function buildApp({ config, db, parser }: BuildAppOptions): Promise<FastifyInstance> {
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

  const authService = createAuthService(createAuthRepository(db));
  const bodyService = createBodyService(createBodyRepository(db));
  const profileService = createProfileService({
    repo: createProfileRepository(db),
    hasWeighIn: (userId) => bodyService.hasWeighIn(userId),
  });
  const nutritionRepo = createNutritionRepository(db);
  const nutritionService = createNutritionService({
    profile: profileService,
    body: bodyService,
    repo: nutritionRepo,
  });
  const foodsService = createFoodsService(createFoodsRepository(db));
  const mealsService = createMealsService({
    repo: nutritionRepo,
    foods: foodsService,
    nutrition: nutritionService,
  });
  const recipesService = createRecipesService({
    repo: createRecipesRepository(db),
    foods: foodsService,
  });
  const mealPlansService = createMealPlansService({
    repo: createMealPlansRepository(db),
    meals: mealsService,
    foods: foodsService,
    recipes: recipesService,
  });
  const exercisesService = createExercisesService({
    repo: createExercisesRepository(db),
    profile: profileService,
  });
  const trainingRepo = createTrainingRepository(db);
  // Treino ↔ recuperação se usam mutuamente: ligação tardia por função.
  const recoveryService = createRecoveryService({
    repo: createRecoveryRepository(db),
    profile: profileService,
    sessionLoads: async (userId, from, to) =>
      (await trainingRepo.sessionLoads(userId, from, to)).map((r) => ({
        date: r.date,
        au: sessionLoad(r.rpe, r.minutes),
      })),
  });
  const agendaService = createAgendaService({
    repo: trainingRepo,
    exercises: exercisesService,
    profile: profileService,
    recovery: () => recoveryService,
  });
  const trainingService = createTrainingService({
    repo: trainingRepo,
    exercises: exercisesService,
    agenda: () => agendaService,
    recovery: () => recoveryService,
  });
  const analyticsService = createAnalyticsService({
    training: trainingService,
    exercises: exercisesService,
    profile: profileService,
  });
  const foodParser =
    parser ??
    createFoodParser({
      model: config.aiModelFast,
      apiKey: config.anthropicApiKey,
      onError: (err) => {
        app.log.warn({ err }, 'ai parser failed; falling back to rules');
      },
    });

  await app.register(
    (v1, _opts, done) => {
      healthRoutes(v1, { db });
      authRoutes(v1, {
        service: authService,
        cookieSecure: config.cookieSecure,
        rateLimitMax: config.authRateLimitMax,
      });
      profileRoutes(v1, { service: profileService, nutrition: nutritionService });
      bodyRoutes(v1, { service: bodyService });
      foodsRoutes(v1, { service: foodsService });
      nutritionRoutes(v1, {
        service: nutritionService,
        meals: mealsService,
        foods: foodsService,
        parser: foodParser,
        aiRateLimitMax: config.aiRateLimitMax,
      });
      recipesRoutes(v1, { service: recipesService });
      mealPlansRoutes(v1, { service: mealPlansService, meals: mealsService });
      exercisesRoutes(v1, { service: exercisesService });
      trainingRoutes(v1, { service: trainingService, agenda: agendaService });
      recoveryRoutes(v1, { service: recoveryService });
      analyticsRoutes(v1, { service: analyticsService });
      done();
    },
    { prefix: '/api/v1' },
  );

  return app;
}
