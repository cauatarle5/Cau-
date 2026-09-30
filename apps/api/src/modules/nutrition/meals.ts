import type { z } from 'zod';

import {
  emptyNutrients,
  normalizeForSearch,
  sumNutrients,
  type FoodUnit,
  type Nutrients,
} from '@atlas/core';
import type { MealItemRow } from '@atlas/db';
import type {
  DaySummary,
  MealDto,
  mealCreateSchema,
  mealItemInputSchema,
  mealItemPatchSchema,
  mealPatchSchema,
} from '@atlas/schemas';

import { AppError, notFound } from '../../lib/errors';
import type { FoodsService } from '../foods/service';
import { computePortion } from '../foods/service';

import type { MealWithItems, NewMealItem, NutritionRepository } from './repository';
import type { NutritionService } from './service';

type ItemInput = z.output<typeof mealItemInputSchema>;

const unitNotConvertible = (index: number) =>
  new AppError(
    422,
    'UNIT_NOT_CONVERTIBLE',
    'Unidade sem conversão',
    'Informe os gramas deste item.',
    [{ field: `items.${String(index)}.grams`, message: 'Informe quantos gramas tem essa medida' }],
  );

const HOUSEHOLD = new Set([
  'unit',
  'slice',
  'tbsp',
  'tsp',
  'cup',
  'scoop',
  'ladle',
  'portion',
  'pinch',
  'glass',
  'can',
  'small',
  'medium',
  'large',
]);

function snapshotOf(item: MealItemRow): Nutrients {
  return { ...emptyNutrients(), ...(item.nutrientsSnapshot as Partial<Nutrients>) };
}

export function toMealDto({ meal, items }: MealWithItems): MealDto {
  const dtoItems = items.map((i) => ({
    id: i.id,
    foodId: i.foodId,
    foodName: i.foodName,
    quantity: i.quantity,
    unitCode: i.unitCode,
    grams: i.grams,
    nutrients: snapshotOf(i),
    parseConfidence: i.parseConfidence,
  }));
  return {
    id: meal.id,
    date: meal.date,
    slot: meal.slot,
    status: meal.status,
    eatenAt: meal.eatenAt?.toISOString() ?? null,
    name: meal.name,
    notes: meal.notes,
    sourceText: meal.sourceText,
    items: dtoItems,
    totals: sumNutrients(dtoItems.map((i) => i.nutrients)),
  };
}

const MACROS = ['kcal', 'proteinG', 'carbsG', 'fatG', 'fiberG'] as const;

export function createMealsService(deps: {
  repo: NutritionRepository;
  foods: FoodsService;
  nutrition: NutritionService;
}) {
  const { repo, foods, nutrition } = deps;

  /** Resolve um item: gramas e snapshot de nutrientes (histórico imutável, P1.6). */
  async function resolveItem(
    userId: string,
    input: ItemInput,
    index: number,
  ): Promise<NewMealItem> {
    const bundle = await foods.bundle(userId, input.foodId);
    const unit: FoodUnit | null = input.unit;
    const portion = computePortion(bundle, input.quantity, unit, input.grams);
    if (!portion.ok) throw unitNotConvertible(index);
    // Gramas informados para uma medida caseira viram medida pessoal (P6.2 passo 5).
    if (input.grams && unit && HOUSEHOLD.has(unit)) {
      await foods.addUserMeasure(userId, input.foodId, {
        unitCode: unit as Parameters<FoodsService['addUserMeasure']>[2]['unitCode'],
        labelPt: 'medida pessoal',
        grams: input.grams / input.quantity,
      });
    }
    return {
      foodId: input.foodId,
      recipeId: null,
      foodName: bundle.food.namePt,
      quantity: input.quantity,
      unitCode: unit ?? 'unit',
      grams: portion.grams,
      nutrientsSnapshot: portion.nutrients,
      parseConfidence: input.parseConfidence ?? null,
    };
  }

  /** Aprendizado (P6.2 passo 8): uso, feedback do parser e alias pessoal quando trocou o alimento. */
  async function learn(
    userId: string,
    sourceText: string | null | undefined,
    inputs: ItemInput[],
    resolved: NewMealItem[],
  ) {
    const corrections = inputs.filter(
      (i) => i.query && i.suggestedFoodId && i.suggestedFoodId !== i.foodId,
    );
    for (const item of resolved) {
      if (item.foodId) await foods.recordUsage(userId, item.foodId, item.grams, item.unitCode);
    }
    for (const c of corrections) {
      await foods.addPersonalAlias(userId, c.foodId, normalizeForSearch(c.query ?? ''));
    }
    if (sourceText && corrections.length > 0) {
      await foods.addParserFeedback(
        userId,
        sourceText,
        corrections.map((c) => ({ query: c.query, foodId: c.suggestedFoodId })),
        corrections.map((c) => ({ query: c.query, foodId: c.foodId })),
      );
    }
  }

  return {
    async create(userId: string, input: z.output<typeof mealCreateSchema>): Promise<MealDto> {
      const resolved: NewMealItem[] = [];
      for (const [index, item] of input.items.entries())
        resolved.push(await resolveItem(userId, item, index));
      const created = await repo.createMeal(
        userId,
        {
          date: input.date,
          slot: input.slot,
          status: input.status,
          eatenAt: input.eatenAt
            ? new Date(input.eatenAt)
            : input.status === 'logged'
              ? new Date()
              : null,
          name: input.name ?? null,
          notes: input.notes ?? null,
          sourceText: input.sourceText ?? null,
        },
        resolved,
      );
      if (input.status === 'logged') await learn(userId, input.sourceText, input.items, resolved);
      return toMealDto(created);
    },

    async list(userId: string, date: string): Promise<MealDto[]> {
      return (await repo.listMeals(userId, date)).map(toMealDto);
    },

    async update(
      userId: string,
      id: string,
      patch: z.output<typeof mealPatchSchema>,
    ): Promise<MealDto> {
      const updated = await repo.updateMeal(userId, id, {
        ...patch,
        eatenAt:
          patch.eatenAt === undefined ? undefined : patch.eatenAt ? new Date(patch.eatenAt) : null,
      });
      if (!updated) throw notFound('Refeição');
      const full = await repo.getMeal(userId, id);
      if (!full) throw notFound('Refeição');
      return toMealDto(full);
    },

    async addItems(userId: string, mealId: string, items: ItemInput[]): Promise<MealDto> {
      const meal = await repo.getMeal(userId, mealId);
      if (!meal) throw notFound('Refeição');
      const resolved: NewMealItem[] = [];
      for (const [index, item] of items.entries())
        resolved.push(await resolveItem(userId, item, index));
      await repo.addItems(mealId, resolved);
      if (meal.meal.status === 'logged') await learn(userId, null, items, resolved);
      const full = await repo.getMeal(userId, mealId);
      if (!full) throw notFound('Refeição');
      return toMealDto(full);
    },

    async updateItem(
      userId: string,
      itemId: string,
      patch: z.output<typeof mealItemPatchSchema>,
    ): Promise<MealDto> {
      const item = await repo.getItem(userId, itemId);
      if (!item) throw notFound('Item');
      const foodId = patch.foodId ?? item.foodId;
      if (!foodId) throw notFound('Alimento');
      const unit = patch.unit !== undefined ? patch.unit : (item.unitCode as FoodUnit);
      const resolved = await resolveItem(
        userId,
        {
          foodId,
          quantity: patch.quantity ?? item.quantity,
          unit,
          grams:
            patch.grams ??
            (patch.quantity || patch.unit !== undefined || patch.foodId ? null : item.grams),
        },
        0,
      );
      await repo.updateItem(itemId, resolved);
      const full = await repo.getMeal(userId, item.mealId);
      if (!full) throw notFound('Refeição');
      return toMealDto(full);
    },

    async deleteItem(userId: string, itemId: string) {
      const item = await repo.getItem(userId, itemId);
      if (!item) throw notFound('Item');
      await repo.deleteItem(itemId);
    },

    async addWater(userId: string, date: string, ml: number) {
      const row = await repo.addWater(userId, date, ml);
      return { id: row.id, date: row.date, ml: row.ml, loggedAt: row.loggedAt.toISOString() };
    },

    /** Resumo do dia: metas, consumido, planejado, restante e água (tela Hoje). */
    async summary(userId: string, date: string, today: string): Promise<DaySummary> {
      const [t, dayMeals, waterMl] = await Promise.all([
        nutrition.targets(userId, date, date, today),
        repo.listMeals(userId, date),
        repo.waterForDate(userId, date),
      ]);
      const totalsFor = (status: 'logged' | 'planned') => {
        const sum = sumNutrients(
          dayMeals.filter((m) => m.meal.status === status).flatMap((m) => m.items.map(snapshotOf)),
        );
        return {
          kcal: sum.kcal ?? 0,
          proteinG: sum.proteinG ?? 0,
          carbsG: sum.carbsG ?? 0,
          fatG: sum.fatG ?? 0,
          fiberG: sum.fiberG ?? 0,
          waterMl: status === 'logged' ? waterMl : 0,
        };
      };
      const consumed = totalsFor('logged');
      const day = t.days[0] ?? null;
      const remaining = day
        ? {
            ...Object.fromEntries(MACROS.map((k) => [k, day[k] - consumed[k]])),
            waterMl: day.waterMl - waterMl,
          }
        : null;
      return {
        date,
        blocked: t.blocked,
        targets: day,
        consumed,
        planned: totalsFor('planned'),
        remaining: remaining as DaySummary['remaining'],
        waterMl,
        loggedMeals: dayMeals.filter((m) => m.meal.status === 'logged').length,
      };
    },
  };
}

export type MealsService = ReturnType<typeof createMealsService>;
