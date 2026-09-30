import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  mealItems,
  meals,
  nutritionTargets,
  sql,
  waterLogs,
  type Database,
  type MealItemRow,
  type MealRow,
  type NutritionTargetRow,
} from '@atlas/db';

export type NewMealItem = Omit<typeof mealItems.$inferInsert, 'id' | 'mealId' | 'createdAt'>;
export type NewMeal = Omit<
  typeof meals.$inferInsert,
  'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;
export type TargetSnapshot = Omit<
  typeof nutritionTargets.$inferInsert,
  'id' | 'userId' | 'createdAt' | 'updatedAt'
>;

export interface MealWithItems {
  meal: MealRow;
  items: MealItemRow[];
}

const activeMeal = (userId: string) => and(eq(meals.userId, userId), isNull(meals.deletedAt));

/** Refeições, água e metas; toda query filtra por `userId`. */
export function createNutritionRepository(db: Database) {
  async function withItems(rows: MealRow[]): Promise<MealWithItems[]> {
    if (rows.length === 0) return [];
    const items = await db
      .select()
      .from(mealItems)
      .where(
        inArray(
          mealItems.mealId,
          rows.map((m) => m.id),
        ),
      )
      .orderBy(asc(mealItems.createdAt), asc(mealItems.id));
    return rows.map((meal) => ({ meal, items: items.filter((i) => i.mealId === meal.id) }));
  }

  return {
    async createMeal(
      userId: string,
      meal: NewMeal,
      items: readonly NewMealItem[],
    ): Promise<MealWithItems> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(meals)
          .values({ ...meal, userId })
          .returning();
        if (!row) throw new Error('insert meals returned no row');
        const inserted = await tx
          .insert(mealItems)
          .values(items.map((i) => ({ ...i, mealId: row.id })))
          .returning();
        return { meal: row, items: inserted };
      });
    },

    async listMeals(userId: string, date: string): Promise<MealWithItems[]> {
      const rows = await db
        .select()
        .from(meals)
        .where(and(activeMeal(userId), eq(meals.date, date)))
        .orderBy(asc(meals.eatenAt), asc(meals.createdAt));
      return withItems(rows);
    },

    async getMeal(userId: string, id: string): Promise<MealWithItems | undefined> {
      const rows = await db
        .select()
        .from(meals)
        .where(and(activeMeal(userId), eq(meals.id, id)))
        .limit(1);
      return (await withItems(rows))[0];
    },

    async updateMeal(userId: string, id: string, patch: Partial<NewMeal>) {
      const [row] = await db
        .update(meals)
        .set(patch)
        .where(and(activeMeal(userId), eq(meals.id, id)))
        .returning();
      return row;
    },

    /** Planejada → consumida só se ainda planejada (idempotente sob concorrência). */
    async markLogged(userId: string, id: string, eatenAt: Date): Promise<boolean> {
      const rows = await db
        .update(meals)
        .set({ status: 'logged', eatenAt })
        .where(and(activeMeal(userId), eq(meals.id, id), eq(meals.status, 'planned')))
        .returning({ id: meals.id });
      return rows.length > 0;
    },

    async addItems(mealId: string, items: readonly NewMealItem[]) {
      await db.insert(mealItems).values(items.map((i) => ({ ...i, mealId })));
    },

    /** Item só é encontrado se a refeição pertence ao usuário. */
    async getItem(userId: string, itemId: string) {
      const [row] = await db
        .select({ item: mealItems })
        .from(mealItems)
        .innerJoin(meals, eq(meals.id, mealItems.mealId))
        .where(and(eq(mealItems.id, itemId), activeMeal(userId)))
        .limit(1);
      return row?.item;
    },

    async updateItem(itemId: string, values: Partial<NewMealItem>) {
      await db.update(mealItems).set(values).where(eq(mealItems.id, itemId));
    },

    async deleteItem(itemId: string) {
      await db.delete(mealItems).where(eq(mealItems.id, itemId));
    },

    async addWater(userId: string, date: string, ml: number) {
      const [row] = await db.insert(waterLogs).values({ userId, date, ml }).returning();
      if (!row) throw new Error('insert water_logs returned no row');
      return row;
    },

    async waterForDate(userId: string, date: string): Promise<number> {
      const [row] = await db
        .select({ total: sql<number>`coalesce(sum(${waterLogs.ml}), 0)::float8` })
        .from(waterLogs)
        .where(and(eq(waterLogs.userId, userId), eq(waterLogs.date, date)));
      return row?.total ?? 0;
    },

    snapshots(userId: string, from: string, to: string): Promise<NutritionTargetRow[]> {
      return db
        .select()
        .from(nutritionTargets)
        .where(
          and(
            eq(nutritionTargets.userId, userId),
            gte(nutritionTargets.date, from),
            lte(nutritionTargets.date, to),
          ),
        );
    },

    async upsertSnapshot(userId: string, s: TargetSnapshot) {
      await db
        .insert(nutritionTargets)
        .values({ ...s, userId })
        .onConflictDoUpdate({
          target: [nutritionTargets.userId, nutritionTargets.date],
          set: { ...s, updatedAt: new Date() },
        });
    },
  };
}

export type NutritionRepository = ReturnType<typeof createNutritionRepository>;
