import { uuidv7 } from 'uuidv7';
import type { z } from 'zod';

import { emptyNutrients, recipeNutrition, type FoodUnit, type Nutrients } from '@atlas/core';
import type { RecipeDto, recipeInputSchema, recipePatchSchema } from '@atlas/schemas';

import { AppError, notFound, validationError } from '../../lib/errors';
import type { FoodsService } from '../foods/service';
import { computePortion, foodNotFound } from '../foods/service';

import type { RecipeBundle, RecipesRepository } from './repository';

type Input = z.output<typeof recipeInputSchema>;
type IngredientInput = Input['ingredients'][number];

const asNutrients = (v: unknown): Nutrients => ({
  ...emptyNutrients(),
  ...(v as Partial<Nutrients>),
});

function toRecipeDto(b: RecipeBundle): RecipeDto {
  const { recipe: r, cache } = b;
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    servings: r.servings,
    cookedWeightG: r.cookedWeightG,
    isFavorite: r.isFavorite,
    tags: r.tags,
    instructions: r.instructions,
    foodId: r.foodId,
    ingredients: b.ingredients.map((i) => ({
      id: i.id,
      foodId: i.foodId,
      foodName: i.foodName,
      quantity: i.quantity,
      unitCode: i.unitCode,
      grams: i.grams,
      nutrients: asNutrients(i.nutrientsSnapshot),
    })),
    nutrition: {
      total: asNutrients(cache?.total),
      perServing: asNutrients(cache?.perServing),
      per100: asNutrients(cache?.per100g),
      totalGrams: cache?.totalGrams ?? 0,
      servingGrams: cache?.servingGrams ?? 0,
      cookedBasis: (r.cookedWeightG ?? 0) > 0,
    },
    createdAt: r.createdAt.toISOString(),
  };
}

export function createRecipesService(deps: { repo: RecipesRepository; foods: FoodsService }) {
  const { repo, foods } = deps;

  /** Gramas e nutrientes de cada ingrediente pelos alimentos atuais (via core). */
  async function resolve(
    userId: string,
    inputs: readonly IngredientInput[],
    selfFoodId: string | null,
  ) {
    const out = [];
    for (const [index, input] of inputs.entries()) {
      if (selfFoodId && input.foodId === selfFoodId) {
        throw validationError([
          {
            field: `ingredients.${String(index)}.foodId`,
            message: 'A receita não pode conter ela mesma',
          },
        ]);
      }
      const bundle = await foods.bundle(userId, input.foodId);
      if (!bundle.food.isActive) throw foodNotFound();
      const portion = computePortion(bundle, input.quantity, input.unit, input.grams);
      if (!portion.ok) {
        throw new AppError(
          422,
          'UNIT_NOT_CONVERTIBLE',
          'Unidade sem conversão',
          'Informe os gramas.',
          [
            {
              field: `ingredients.${String(index)}.grams`,
              message: 'Informe quantos gramas tem essa medida',
            },
          ],
        );
      }
      out.push({
        foodId: input.foodId,
        foodName: bundle.food.namePt,
        quantity: input.quantity,
        // Sem unidade = medida padrão do alimento, como nas refeições.
        unitCode: input.unit ?? 'unit',
        grams: portion.grams,
        nutrientsSnapshot: portion.nutrients,
        order: index,
      });
    }
    return out;
  }

  /** Recalcula a receita, o alimento que a representa e o cache (ADR-038). */
  async function compute(
    userId: string,
    recipeId: string,
    name: string,
    servings: number,
    cookedWeightG: number | null,
    inputs: readonly IngredientInput[],
    selfFoodId: string | null,
  ) {
    const ingredients = await resolve(userId, inputs, selfFoodId);
    const n = recipeNutrition(
      ingredients.map((i) => ({ grams: i.grams, nutrients: i.nutrientsSnapshot })),
      servings,
      cookedWeightG,
    );
    const foodId = await foods.upsertRecipeFood(
      userId,
      recipeId,
      name,
      { ...n.per100, kcal: n.per100.kcal ?? 0 },
      n.servingGrams,
    );
    const cache = {
      total: n.total,
      perServing: n.perServing,
      per100g: n.per100,
      totalGrams: n.totalGrams,
      servingGrams: n.servingGrams,
    };
    return { ingredients, cache, foodId };
  }

  /** Receita dentro de receita não pode formar ciclo (A em B e B em A). */
  async function assertNoCycle(
    userId: string,
    selfFoodId: string,
    inputs: readonly IngredientInput[],
  ) {
    const seen = new Set<string>();
    const stack = inputs.map((i) => i.foodId);
    while (stack.length > 0) {
      const foodId = stack.pop() as string;
      if (foodId === selfFoodId) {
        throw validationError([
          {
            field: 'ingredients',
            message: 'Uma receita não pode conter a si mesma, nem indiretamente',
          },
        ]);
      }
      if (seen.has(foodId)) continue;
      seen.add(foodId);
      const inner = await repo.byFood(userId, foodId);
      if (inner) stack.push(...inner.ingredients.map((i) => i.foodId));
    }
  }

  async function get(userId: string, id: string) {
    const b = await repo.get(userId, id);
    if (!b) throw notFound('Receita');
    return b;
  }

  async function create(userId: string, input: Input): Promise<RecipeDto> {
    const id = uuidv7();
    const cookedWeightG = input.cookedWeightG ?? null;
    const { ingredients, cache, foodId } = await compute(
      userId,
      id,
      input.name,
      input.servings,
      cookedWeightG,
      input.ingredients,
      null,
    );
    const insert = repo.insert(
      userId,
      {
        id,
        name: input.name,
        description: input.description ?? null,
        servings: input.servings,
        cookedWeightG,
        isFavorite: input.isFavorite,
        tags: input.tags,
        instructions: input.instructions ?? null,
        foodId,
      },
      ingredients,
      cache,
    );
    // Sem receita gravada, o alimento criado não pode ficar na busca.
    await insert.catch(async (err: unknown) => {
      await foods.setActive(userId, foodId, false);
      throw err;
    });
    return toRecipeDto(await get(userId, id));
  }

  const existingInputs = (b: RecipeBundle): IngredientInput[] =>
    b.ingredients.map((i) => ({
      foodId: i.foodId,
      quantity: i.quantity,
      unit: i.unitCode as FoodUnit,
      grams: i.grams,
    }));

  /**
   * Recalcula a receita e, em cascata, as que a usam como ingrediente (P4.6: o cache muda
   * quando ingredientes ou alimentos mudam).
   */
  async function update(
    userId: string,
    id: string,
    patch: z.output<typeof recipePatchSchema>,
    visited: Set<string>,
  ): Promise<void> {
    visited.add(id);
    const current = await get(userId, id);
    const r = current.recipe;
    const name = patch.name ?? r.name;
    const servings = patch.servings ?? r.servings;
    const cookedWeightG = patch.cookedWeightG !== undefined ? patch.cookedWeightG : r.cookedWeightG;
    const inputs = patch.ingredients ?? existingInputs(current);
    if (r.foodId && patch.ingredients) await assertNoCycle(userId, r.foodId, inputs);
    const { ingredients, cache, foodId } = await compute(
      userId,
      id,
      name,
      servings,
      cookedWeightG,
      inputs,
      r.foodId,
    );
    const ok = await repo.update(
      userId,
      id,
      {
        name,
        servings,
        cookedWeightG,
        foodId,
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.isFavorite !== undefined ? { isFavorite: patch.isFavorite } : {}),
        ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
        ...(patch.instructions !== undefined ? { instructions: patch.instructions } : {}),
      },
      ingredients,
      cache,
    );
    if (!ok) {
      // Excluída no meio da edição: o alimento reativado volta a sair da busca.
      await foods.setActive(userId, foodId, false);
      throw notFound('Receita');
    }
    for (const dep of await repo.dependents(userId, foodId)) {
      if (!visited.has(dep)) await update(userId, dep, {}, visited);
    }
  }

  return {
    async list(userId: string) {
      return (await repo.list(userId)).map(toRecipeDto);
    },

    async get(userId: string, id: string) {
      return toRecipeDto(await get(userId, id));
    },

    create,

    /** Editar recalcula tudo pelos alimentos atuais; refeições registradas não mudam (snapshot). */
    async update(userId: string, id: string, patch: z.output<typeof recipePatchSchema>) {
      await update(userId, id, patch, new Set());
      return toRecipeDto(await get(userId, id));
    },

    async duplicate(userId: string, id: string) {
      const b = await get(userId, id);
      const r = b.recipe;
      return create(userId, {
        name: `${r.name} (cópia)`.slice(0, 120),
        description: r.description,
        servings: r.servings,
        cookedWeightG: r.cookedWeightG,
        isFavorite: false,
        tags: r.tags,
        instructions: r.instructions,
        ingredients: existingInputs(b),
      });
    },

    /** Exclusão lógica; o alimento da receita sai da busca (ADR-038). */
    async remove(userId: string, id: string) {
      const row = await repo.softDelete(userId, id);
      if (!row) throw notFound('Receita');
      if (row.foodId) await foods.setActive(userId, row.foodId, false);
    },

    favoriteFoods: (userId: string) => repo.favoriteFoods(userId),
  };
}

export type RecipesService = ReturnType<typeof createRecipesService>;
