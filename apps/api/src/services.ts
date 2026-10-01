import { sessionLoad } from '@atlas/core';
import type { Database } from '@atlas/db';

import { createAnalyticsService } from './modules/analytics';
import { createAuthRepository, createAuthService } from './modules/auth/index';
import { createBodyRepository, createBodyService } from './modules/body';
import { createExercisesRepository, createExercisesService } from './modules/exercises';
import { createFoodsRepository, createFoodsService } from './modules/foods';
import {
  createDailyContextService,
  createEnergyService,
  createInsightsRepository,
  createInsightsService,
  createMetricsData,
} from './modules/insights';
import { createMealPlansRepository, createMealPlansService } from './modules/meal-plans';
import {
  createMealsService,
  createNutritionRepository,
  createNutritionService,
} from './modules/nutrition';
import { createRealPlanProvider } from './modules/nutrition/real-plan';
import { createProfileRepository, createProfileService } from './modules/profile';
import { createRecipesRepository, createRecipesService } from './modules/recipes';
import { createRecoveryRepository, createRecoveryService } from './modules/recovery';
import {
  createAgendaService,
  createTrainingRepository,
  createTrainingService,
} from './modules/training';

/** Todos os serviços da API, ligados entre si (usado pelo servidor e pelo seed demo). */
export function createServices(db: Database) {
  const authService = createAuthService(createAuthRepository(db));
  const bodyService = createBodyService(createBodyRepository(db));
  const profileService = createProfileService({
    repo: createProfileRepository(db),
    hasWeighIn: (userId) => bodyService.hasWeighIn(userId),
  });
  const nutritionRepo = createNutritionRepository(db);
  const trainingRepo = createTrainingRepository(db);
  const recoveryRepo = createRecoveryRepository(db);
  const insightsRepo = createInsightsRepository(db);
  const energyService = createEnergyService({
    repo: insightsRepo,
    body: bodyService,
    nutrition: () => nutritionService,
  });
  const nutritionService = createNutritionService({
    profile: profileService,
    body: bodyService,
    repo: nutritionRepo,
    realPlan: createRealPlanProvider({ trainingRepo, recoveryRepo }),
    adaptiveTdee: (userId, today) => energyService.usable(userId, today),
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
  // Treino ↔ recuperação se usam mutuamente: ligação tardia por função.
  const recoveryService = createRecoveryService({
    repo: recoveryRepo,
    profile: profileService,
    sessionLoads: async (userId, from, to) =>
      (await trainingRepo.sessionLoads(userId, from, to)).map((r) => ({
        date: r.date,
        au: sessionLoad(r.rpe, r.minutes),
      })),
    assertSession: async (userId, id) => {
      await trainingService.getSession(userId, id);
    },
    assertExercise: async (userId, id) => {
      await exercisesService.getBundle(userId, id);
    },
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
  const metricsData = createMetricsData({
    repo: insightsRepo,
    trainingRepo,
    exercises: exercisesService,
    nutrition: nutritionService,
    recovery: () => recoveryService,
    body: bodyService,
  });
  const analyticsService = createAnalyticsService({
    training: trainingService,
    exercises: exercisesService,
    profile: profileService,
    data: metricsData,
    insightsRepo,
    recovery: () => recoveryService,
  });
  const insightsService = createInsightsService({
    repo: insightsRepo,
    data: metricsData,
    profile: profileService,
    body: bodyService,
    recovery: () => recoveryService,
    performedInRange: (userId, from, to) => trainingService.performedInRange(userId, from, to),
  });
  const dailyContextService = createDailyContextService({
    meals: mealsService,
    recovery: () => recoveryService,
    agenda: () => agendaService,
    training: () => trainingService,
    body: bodyService,
    insights: insightsService,
  });
  return {
    auth: authService,
    body: bodyService,
    profile: profileService,
    nutrition: nutritionService,
    foods: foodsService,
    meals: mealsService,
    recipes: recipesService,
    mealPlans: mealPlansService,
    exercises: exercisesService,
    recovery: recoveryService,
    agenda: agendaService,
    training: trainingService,
    analytics: analyticsService,
    insights: insightsService,
    energy: energyService,
    dailyContext: dailyContextService,
    insightsRepo,
  };
}

export type Services = ReturnType<typeof createServices>;
