import type { z } from 'zod';

import {
  emptyNutrients,
  normalizeForSearch,
  remainingTargets,
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

export function snapshotOf(item: MealItemRow): Nutrients {
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

export function createMealsService(deps: {
  repo: NutritionRepository;
  foods: FoodsService;
  nutrition: NutritionService;
}) {
  const { repo, foods, nutrition } = deps;

  interface PendingMeasure {
    foodId: string;
    unitCode: Parameters<FoodsService['addUserMeasure']>[2]['unitCode'];
    grams: number;
  }

  /**
   * Resolve um item: gramas e snapshot de nutrientes (histórico imutável, P1.6). Gramas
   * informados só viram medida pessoal quando a unidade caseira não converteria sem eles.
   */
  async function resolveItem(
    userId: string,
    input: ItemInput,
    index: number,
  ): Promise<{ item: NewMealItem; measure: PendingMeasure | null }> {
    const bundle = await foods.bundle(userId, input.foodId);
    const unit: FoodUnit | null = input.unit;
    const portion = computePortion(bundle, input.quantity, unit, input.grams);
    if (!portion.ok) throw unitNotConvertible(index);
    const needsMeasure =
      !!input.grams &&
      !!unit &&
      HOUSEHOLD.has(unit) &&
      !computePortion(bundle, input.quantity, unit).ok;
    return {
      item: {
        foodId: input.foodId,
        // Receita registrada como alimento (ADR-038): guarda a origem.
        recipeId: bundle.food.sourceCode === 'recipe' ? bundle.food.sourceRef : null,
        foodName: bundle.food.namePt,
        quantity: input.quantity,
        unitCode: unit ?? 'unit',
        grams: portion.grams,
        nutrientsSnapshot: portion.nutrients,
        parseConfidence: input.parseConfidence ?? null,
      },
      measure:
        needsMeasure && input.grams
          ? {
              foodId: input.foodId,
              unitCode: unit as PendingMeasure['unitCode'],
              grams: input.grams / input.quantity,
            }
          : null,
    };
  }

  async function resolveAll(userId: string, inputs: ItemInput[]) {
    const resolved: { item: NewMealItem; measure: PendingMeasure | null }[] = [];
    for (const [index, input] of inputs.entries())
      resolved.push(await resolveItem(userId, input, index));
    return resolved;
  }

  /** Medidas pessoais só depois da refeição gravada (P6.2 passo 5). */
  async function saveMeasures(userId: string, measures: (PendingMeasure | null)[]) {
    for (const m of measures) {
      if (m)
        await foods.addUserMeasure(userId, m.foodId, {
          unitCode: m.unitCode,
          labelPt: 'medida pessoal',
          grams: m.grams,
        });
    }
  }

  /**
   * Aprendizado (P6.2 passo 8): uso, alias pessoal quando o usuário escolheu outro alimento
   * para o termo (inclusive quando não havia sugestão) e feedback do parser.
   */
  async function learn(
    userId: string,
    sourceText: string | null | undefined,
    inputs: ItemInput[],
    resolved: NewMealItem[],
  ) {
    for (const item of resolved) {
      if (item.foodId) await foods.recordUsage(userId, item.foodId, item.grams, item.unitCode);
    }
    const corrections = inputs.filter((i) => i.query && (i.suggestedFoodId ?? null) !== i.foodId);
    for (const c of corrections) {
      const alias = normalizeForSearch(c.query ?? '');
      if (alias) await foods.addPersonalAlias(userId, c.foodId, alias);
    }
    if (sourceText && corrections.length > 0) {
      await foods.addParserFeedback(
        userId,
        sourceText,
        corrections.map((c) => ({ query: c.query, foodId: c.suggestedFoodId ?? null })),
        corrections.map((c) => ({ query: c.query, foodId: c.foodId })),
      );
    }
  }

  return {
    async create(userId: string, input: z.output<typeof mealCreateSchema>): Promise<MealDto> {
      const resolvedAll = await resolveAll(userId, input.items);
      const resolved = resolvedAll.map((r) => r.item);
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
      await saveMeasures(
        userId,
        resolvedAll.map((r) => r.measure),
      );
      if (input.status === 'logged') await learn(userId, input.sourceText, input.items, resolved);
      return toMealDto(created);
    },

    /** Planejada → consumida (P7.3): muda o status e conta o uso dos alimentos. */
    async log(userId: string, id: string, eatenAt?: string): Promise<MealDto> {
      const current = await repo.getMeal(userId, id);
      if (!current) throw notFound('Refeição');
      const changed = await repo.markLogged(userId, id, eatenAt ? new Date(eatenAt) : new Date());
      // Só quem efetivamente mudou o status conta o uso (repetir ou correr não duplica).
      if (changed) {
        for (const item of current.items) {
          if (item.foodId) await foods.recordUsage(userId, item.foodId, item.grams, item.unitCode);
        }
      }
      const full = await repo.getMeal(userId, id);
      if (!full) throw notFound('Refeição');
      return toMealDto(full);
    },

    /** Refeições do dia com itens brutos (para modelos, cópia e alertas). */
    rawMeals: (userId: string, date: string) => repo.listMeals(userId, date),
    getRawMeal: (userId: string, id: string) => repo.getMeal(userId, id),
    getRawItem: (userId: string, itemId: string) => repo.getItem(userId, itemId),

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
      const resolvedAll = await resolveAll(userId, items);
      const resolved = resolvedAll.map((r) => r.item);
      await repo.addItems(mealId, resolved);
      await saveMeasures(
        userId,
        resolvedAll.map((r) => r.measure),
      );
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
      const changedPortion =
        patch.quantity !== undefined || patch.unit !== undefined || patch.foodId !== undefined;
      const { item: resolved, measure } = await resolveItem(
        userId,
        {
          foodId,
          quantity: patch.quantity ?? item.quantity,
          unit: patch.unit !== undefined ? patch.unit : (item.unitCode as FoodUnit),
          // Sem mudança de porção, mantém os gramas do snapshot (e não gera medida pessoal).
          grams: patch.grams ?? (changedPortion ? null : item.grams),
          parseConfidence: item.parseConfidence,
        },
        0,
      );
      await repo.updateItem(itemId, resolved);
      if (patch.grams) await saveMeasures(userId, [measure]);
      // Trocar o alimento de um item registrado conta como uso (P6.2 passo 8); num item
      // planejado não, pois ainda não foi comido (P7.2).
      const meal = await repo.getMeal(userId, item.mealId);
      if (patch.foodId && patch.foodId !== item.foodId && meal?.meal.status === 'logged') {
        await foods.recordUsage(userId, patch.foodId, resolved.grams, resolved.unitCode);
      }
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
      const remaining = day ? remainingTargets(day, consumed) : null;
      return {
        date,
        blocked: t.blocked,
        targets: day,
        consumed,
        planned: totalsFor('planned'),
        remaining,
        waterMl,
        loggedMeals: dayMeals.filter((m) => m.meal.status === 'logged').length,
      };
    },
  };
}

export type MealsService = ReturnType<typeof createMealsService>;
