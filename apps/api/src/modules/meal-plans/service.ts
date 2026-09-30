import type { z } from 'zod';

import {
  addDays,
  complementSuggestions,
  findSubstitutions,
  plannedRemaining,
  planningAlerts,
  poolSizing,
  scaleNutrients,
  suggestMeal,
  type FoodUnit,
  type OverNutrient,
  type SubstitutionFood,
  type SuggestPoolItem,
} from '@atlas/core';
import type {
  DayPlanDto,
  MealDto,
  MealTemplateDto,
  SuggestMealDto,
  mealCopySchema,
  mealTemplateInputSchema,
  suggestMealRequestSchema,
} from '@atlas/schemas';

import { notFound, validationError } from '../../lib/errors';
import type { FoodBundle } from '../foods/repository';
import type { FoodsService } from '../foods/service';
import { per100, toFoodDto } from '../foods/service';
import type { MealsService } from '../nutrition/meals';
import { snapshotOf } from '../nutrition/meals';
import type { RecipesService } from '../recipes/service';

import type { MealPlansRepository, TemplateItem } from './repository';

const POOL_LIMIT = 12;

function toTemplateDto(
  row: Awaited<ReturnType<MealPlansRepository['list']>>[number],
): MealTemplateDto {
  return {
    id: row.id,
    name: row.name,
    slotHint: row.slotHint,
    items: row.items as TemplateItem[],
    createdAt: row.createdAt.toISOString(),
  };
}

const toSubstitutionFood = (b: FoodBundle, fromHistory = false): SubstitutionFood => ({
  id: b.food.id,
  name: b.food.namePt,
  category: b.food.category,
  per100: per100(b),
  fromHistory,
});

export function createMealPlansService(deps: {
  repo: MealPlansRepository;
  meals: MealsService;
  foods: FoodsService;
  recipes: RecipesService;
}) {
  const { repo, meals, foods, recipes } = deps;

  /** Cria refeições planejadas no destino, uma por slot, com os gramas da origem. */
  async function plan(userId: string, date: string, items: readonly TemplateItem[]) {
    // Alimentos de receitas excluídas (inativos) ficam de fora da cópia (ADR-038).
    const bundles = await foods.bundles(userId, [...new Set(items.map((i) => i.foodId))]);
    const bySlot = new Map<TemplateItem['slot'], TemplateItem[]>();
    for (const i of items) {
      if (!bundles.get(i.foodId)?.food.isActive) continue;
      bySlot.set(i.slot, [...(bySlot.get(i.slot) ?? []), i]);
    }
    if (bySlot.size === 0) {
      throw validationError([
        { field: 'fromDate', message: 'Nenhum alimento disponível para copiar' },
      ]);
    }
    const created: MealDto[] = [];
    for (const [slot, list] of bySlot) {
      created.push(
        await meals.create(userId, {
          date,
          slot,
          status: 'planned',
          items: list.map((i) => ({
            foodId: i.foodId,
            quantity: i.quantity,
            unit: i.unitCode as FoodUnit,
            grams: i.grams,
          })),
        }),
      );
    }
    return created;
  }

  async function itemsOfDate(userId: string, date: string): Promise<TemplateItem[]> {
    return (await meals.rawMeals(userId, date)).flatMap(({ meal, items }) =>
      items.flatMap((i) =>
        i.foodId
          ? [
              {
                slot: meal.slot,
                foodId: i.foodId,
                foodName: i.foodName,
                quantity: i.quantity,
                unitCode: i.unitCode,
                grams: i.grams,
              },
            ]
          : [],
      ),
    );
  }

  /** Resumo do dia + alertas do planejamento (core). */
  async function dayPlan(userId: string, date: string, today: string): Promise<DayPlanDto> {
    const [summary, raw] = await Promise.all([
      meals.summary(userId, date, today),
      meals.rawMeals(userId, date),
    ]);
    const planned = raw
      .filter((m) => m.meal.status === 'planned')
      .flatMap((m) =>
        m.items.map((i) => ({ id: i.id, foodName: i.foodName, nutrients: snapshotOf(i) })),
      );
    const alerts = summary.targets
      ? planningAlerts(summary.targets, summary.consumed, planned)
      : [];
    return { summary, alerts };
  }

  return {
    async listTemplates(userId: string) {
      return (await repo.list(userId)).map(toTemplateDto);
    },

    /** Modelo a partir de uma refeição (com `slot_hint`) ou do dia inteiro (ADR-040). */
    async createTemplate(userId: string, input: z.output<typeof mealTemplateInputSchema>) {
      let items: TemplateItem[];
      let slotHint: TemplateItem['slot'] | null = null;
      if (input.mealId) {
        const found = await meals.getRawMeal(userId, input.mealId);
        if (!found) throw notFound('Refeição');
        slotHint = found.meal.slot;
        items = found.items.flatMap((i) =>
          i.foodId
            ? [
                {
                  slot: found.meal.slot,
                  foodId: i.foodId,
                  foodName: i.foodName,
                  quantity: i.quantity,
                  unitCode: i.unitCode,
                  grams: i.grams,
                },
              ]
            : [],
        );
      } else {
        items = await itemsOfDate(userId, input.date ?? '');
      }
      if (items.length === 0) {
        throw validationError([
          { field: input.mealId ? 'mealId' : 'date', message: 'Nada para salvar' },
        ]);
      }
      return toTemplateDto(await repo.insert(userId, { name: input.name, slotHint, items }));
    },

    async removeTemplate(userId: string, id: string) {
      if (!(await repo.remove(userId, id))) throw notFound('Modelo');
    },

    /** Copia um dia ou aplica um modelo como refeições planejadas (P7.3). */
    async copy(userId: string, input: z.output<typeof mealCopySchema>) {
      let items: TemplateItem[];
      if (input.templateId) {
        const t = await repo.get(userId, input.templateId);
        if (!t) throw notFound('Modelo');
        const slot = input.slot;
        items = (t.items as TemplateItem[]).map((i) => (slot && t.slotHint ? { ...i, slot } : i));
      } else {
        items = await itemsOfDate(userId, input.fromDate ?? '');
      }
      if (items.length === 0) {
        throw validationError([{ field: 'fromDate', message: 'Não há refeições para copiar' }]);
      }
      return plan(userId, input.toDate, items);
    },

    dayPlan,

    /** Alternativas para o item que estoura um nutriente (P7.3, ADR-040). */
    async substitutions(userId: string, itemId: string, nutrient: OverNutrient) {
      const item = await meals.getRawItem(userId, itemId);
      if (!item?.foodId) throw notFound('Item');
      const original = await foods.bundle(userId, item.foodId);
      const [catalog, usage] = await Promise.all([
        foods.byCategory(userId, original.food.category),
        foods.usage(userId),
      ]);
      const used = new Set(usage.map((u) => u.user_food_usage.foodId));
      // O histórico entra mesmo se o catálogo da categoria for grande (P7.3).
      const history = [...(await foods.bundles(userId, [...used])).values()].filter(
        (b) => b.food.category === original.food.category && b.food.isActive,
      );
      const candidates = [...new Map([...history, ...catalog].map((b) => [b.food.id, b])).values()];
      const byId = new Map(candidates.map((c) => [c.food.id, c]));
      const options = findSubstitutions(
        { food: toSubstitutionFood(original), grams: item.grams },
        nutrient,
        candidates.map((c) => toSubstitutionFood(c, used.has(c.food.id))),
      );
      return {
        original: { foodName: item.foodName, grams: item.grams, nutrients: snapshotOf(item) },
        items: options.flatMap((o) => {
          const b = byId.get(o.food.id);
          return b
            ? [
                {
                  food: toFoodDto(b),
                  grams: o.grams,
                  nutrients: o.nutrients,
                  reduction: o.reduction,
                },
              ]
            : [];
        }),
      };
    },

    /**
     * Complemento para proteína ou fibra abaixo da faixa (P7.3): histórico do usuário primeiro,
     * depois o catálogo das categorias ricas no nutriente.
     */
    async complements(
      userId: string,
      date: string,
      today: string,
      nutrient: 'proteinG' | 'fiberG',
    ) {
      const { alerts } = await dayPlan(userId, date, today);
      const low = alerts.find((a) => a.kind === 'low' && a.nutrient === nutrient);
      const missing = low?.kind === 'low' ? low.missing : 0;
      if (missing <= 0) return { nutrient, missing: 0, items: [] };
      const categories =
        nutrient === 'proteinG'
          ? (['poultry', 'meats', 'fish', 'eggs', 'dairy', 'legumes'] as const)
          : (['legumes', 'fruits', 'vegetables', 'cereals'] as const);
      const [usage, ...catalogs] = await Promise.all([
        foods.usage(userId),
        ...categories.map((c) => foods.byCategory(userId, c)),
      ]);
      const used = new Set(usage.map((u) => u.user_food_usage.foodId));
      const history = [...(await foods.bundles(userId, [...used])).values()].filter(
        (b) => b.food.isActive,
      );
      const pool = [
        ...new Map([...history, ...catalogs.flat()].map((b) => [b.food.id, b])).values(),
      ];
      const byId = new Map(pool.map((b) => [b.food.id, b]));
      const options = complementSuggestions(
        nutrient,
        missing,
        pool.map((b) => toSubstitutionFood(b, used.has(b.food.id))),
      );
      return {
        nutrient,
        missing,
        items: options.flatMap((o) => {
          const b = byId.get(o.food.id);
          return b ? [{ food: toFoodDto(b), grams: o.grams, nutrients: o.nutrients }] : [];
        }),
      };
    },

    /**
     * Sugestão pelos macros restantes (P7.2, ADR-039): pool de receitas favoritas, modelos e
     * alimentos dos últimos 30 dias; limites padrão = restante previsto do dia.
     */
    async suggest(
      userId: string,
      input: z.output<typeof suggestMealRequestSchema>,
      today: string,
    ): Promise<SuggestMealDto> {
      const summary = await meals.summary(userId, input.date, today);
      const left = summary.targets
        ? plannedRemaining(summary.targets, summary.consumed, summary.planned)
        : null;
      const constraints = {
        kcal: input.kcal ?? left?.kcal ?? 0,
        proteinMin: input.proteinMin ?? left?.proteinG ?? 0,
        carbsMax: input.carbsMax ?? left?.carbsG ?? 0,
        fatMax: input.fatMax ?? left?.fatG ?? 0,
      };

      const [favorites, templates, usage] = await Promise.all([
        recipes.favoriteFoods(userId),
        repo.list(userId),
        foods.usage(userId, { since: new Date(`${addDays(today, -30)}T00:00:00Z`) }),
      ]);
      const sizing = new Map<string, { step: number; maxGrams: number }>();
      for (const f of favorites) {
        sizing.set(f.foodId, poolSizing({ kind: 'recipe', servingGrams: f.servingGrams }));
      }
      for (const tpl of templates) {
        for (const i of tpl.items as TemplateItem[]) {
          if (!sizing.has(i.foodId))
            sizing.set(i.foodId, poolSizing({ kind: 'template', grams: i.grams }));
        }
      }
      for (const u of usage) {
        const id = u.user_food_usage.foodId;
        if (!sizing.has(id)) {
          sizing.set(
            id,
            poolSizing({ kind: 'history', lastGrams: u.user_food_usage.lastQuantityG }),
          );
        }
      }
      const all = await foods.bundles(userId, [...sizing.keys()]);
      const ids = [...sizing.keys()]
        .filter((id) => all.get(id)?.food.isActive)
        .slice(0, POOL_LIMIT);
      const bundles = new Map(
        ids.flatMap((id) => {
          const b = all.get(id);
          return b ? [[id, b] as const] : [];
        }),
      );
      const pool: SuggestPoolItem[] = ids.flatMap((id) => {
        const b = bundles.get(id);
        const size = sizing.get(id);
        if (!b || !size) return [];
        const p = per100(b);
        return [
          {
            key: id,
            name: b.food.namePt,
            per100: {
              kcal: p.kcal ?? 0,
              proteinG: p.proteinG ?? 0,
              carbsG: p.carbsG ?? 0,
              fatG: p.fatG ?? 0,
            },
            step: size.step,
            maxGrams: size.maxGrams,
          },
        ];
      });
      const options = suggestMeal(pool, constraints);
      return {
        constraints,
        options: options.map((o) => ({
          totals: o.totals,
          remaining: o.remaining,
          items: o.items.flatMap((i) => {
            const b = bundles.get(i.key);
            return b
              ? [
                  {
                    food: toFoodDto(b),
                    grams: i.grams,
                    nutrients: scaleNutrients(per100(b), i.grams),
                  },
                ]
              : [];
          }),
        })),
      };
    },
  };
}

export type MealPlansService = ReturnType<typeof createMealPlansService>;
