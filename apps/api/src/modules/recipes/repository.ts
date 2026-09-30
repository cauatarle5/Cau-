import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  recipeIngredients,
  recipeNutritionCache,
  recipes,
  type Database,
  type RecipeIngredientRow,
  type RecipeRow,
} from '@atlas/db';

type NewIngredient = Omit<typeof recipeIngredients.$inferInsert, 'id' | 'recipeId'>;
type Cache = Omit<typeof recipeNutritionCache.$inferInsert, 'recipeId' | 'computedAt'>;

export interface RecipeBundle {
  recipe: RecipeRow;
  ingredients: RecipeIngredientRow[];
  cache: typeof recipeNutritionCache.$inferSelect | null;
}

const live = (userId: string) => and(eq(recipes.userId, userId), isNull(recipes.deletedAt));

/** Toda leitura e escrita exige `userId` (ADR-004). */
export function createRecipesRepository(db: Database) {
  async function bundles(rows: RecipeRow[]): Promise<RecipeBundle[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [ings, caches] = await Promise.all([
      db
        .select()
        .from(recipeIngredients)
        .where(inArray(recipeIngredients.recipeId, ids))
        .orderBy(asc(recipeIngredients.order)),
      db.select().from(recipeNutritionCache).where(inArray(recipeNutritionCache.recipeId, ids)),
    ]);
    return rows.map((recipe) => ({
      recipe,
      ingredients: ings.filter((i) => i.recipeId === recipe.id),
      cache: caches.find((c) => c.recipeId === recipe.id) ?? null,
    }));
  }

  async function writeChildren(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    recipeId: string,
    ingredients: readonly NewIngredient[],
    cache: Cache,
  ) {
    await tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId));
    await tx.insert(recipeIngredients).values(ingredients.map((i) => ({ ...i, recipeId })));
    const values = { ...cache, computedAt: new Date() };
    await tx
      .insert(recipeNutritionCache)
      .values({ recipeId, ...values })
      .onConflictDoUpdate({ target: recipeNutritionCache.recipeId, set: values });
  }

  return {
    async list(userId: string) {
      const rows = await db
        .select()
        .from(recipes)
        .where(live(userId))
        .orderBy(desc(recipes.isFavorite), asc(recipes.name));
      return bundles(rows);
    },

    async get(userId: string, id: string): Promise<RecipeBundle | undefined> {
      const rows = await db
        .select()
        .from(recipes)
        .where(and(live(userId), eq(recipes.id, id)));
      return (await bundles(rows))[0];
    },

    async insert(
      userId: string,
      values: Omit<typeof recipes.$inferInsert, 'userId'> & { id: string },
      ingredients: readonly NewIngredient[],
      cache: Cache,
    ) {
      await db.transaction(async (tx) => {
        await tx.insert(recipes).values({ ...values, userId });
        await writeChildren(tx, values.id, ingredients, cache);
      });
    },

    async update(
      userId: string,
      id: string,
      values: Partial<typeof recipes.$inferInsert>,
      ingredients: readonly NewIngredient[],
      cache: Cache,
    ): Promise<boolean> {
      return db.transaction(async (tx) => {
        const rows = await tx
          .update(recipes)
          .set({ ...values, updatedAt: new Date() })
          .where(and(live(userId), eq(recipes.id, id)))
          .returning({ id: recipes.id });
        if (rows.length === 0) return false;
        await writeChildren(tx, id, ingredients, cache);
        return true;
      });
    },

    async softDelete(userId: string, id: string) {
      const [row] = await db
        .update(recipes)
        .set({ deletedAt: new Date() })
        .where(and(live(userId), eq(recipes.id, id)))
        .returning({ foodId: recipes.foodId });
      return row;
    },

    /** Alimentos das receitas favoritas (pool do solver, P7.2). */
    async favoriteFoods(userId: string) {
      const rows = await db
        .select({ foodId: recipes.foodId, servingGrams: recipeNutritionCache.servingGrams })
        .from(recipes)
        .innerJoin(recipeNutritionCache, eq(recipeNutritionCache.recipeId, recipes.id))
        .where(and(live(userId), eq(recipes.isFavorite, true)));
      return rows.flatMap((r) =>
        r.foodId ? [{ foodId: r.foodId, servingGrams: r.servingGrams }] : [],
      );
    },
  };
}

export type RecipesRepository = ReturnType<typeof createRecipesRepository>;
