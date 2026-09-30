import {
  and,
  eq,
  foodAliases,
  foodNutrients,
  foods,
  householdMeasures,
  inArray,
  isNull,
  or,
  parserFeedback,
  sql,
  userFoodUsage,
  type Database,
  type FoodNutrientsRow,
  type FoodRow,
  type HouseholdMeasureRow,
} from '@atlas/db';

/** Alimentos visíveis ao usuário: catálogo global + os dele. */
const visible = (userId: string) => or(isNull(foods.userId), eq(foods.userId, userId));

export interface FoodCandidate {
  foodId: string;
  similarity: number;
  timesUsed: number;
}

export interface FoodBundle {
  food: FoodRow;
  nutrients: FoodNutrientsRow | null;
  measures: HouseholdMeasureRow[];
}

export function createFoodsRepository(db: Database) {
  return {
    /**
     * Candidatos por similaridade trigram no nome e nos aliases (globais + do usuário),
     * com o uso do usuário (P6.2 passo 4). No nome, a similaridade é a média entre a
     * do texto inteiro e a da melhor palavra, para um alias exato vencer nomes longos.
     */
    async candidates(userId: string, q: string, limit: number): Promise<FoodCandidate[]> {
      const rows = await db.execute<{
        food_id: string;
        sim: number;
        times_used: number | null;
      }>(sql`
        with c as (
          select f.id as food_id,
                 (similarity(f.name_normalized, ${q}) + word_similarity(${q}, f.name_normalized)) / 2 as sim
          from ${foods} f
          where (f.user_id is null or f.user_id = ${userId})
            and (f.name_normalized % ${q} or ${q} <% f.name_normalized)
          union all
          select a.food_id, similarity(a.alias_normalized, ${q}) as sim
          from ${foodAliases} a
          join ${foods} f on f.id = a.food_id
          where (a.user_id is null or a.user_id = ${userId})
            and (f.user_id is null or f.user_id = ${userId})
            and a.alias_normalized % ${q}
        )
        select c.food_id, max(c.sim)::float8 as sim, u.times_used
        from c
        left join ${userFoodUsage} u on u.food_id = c.food_id and u.user_id = ${userId}
        group by c.food_id, u.times_used
        order by sim desc
        limit ${limit}
      `);
      return rows.rows.map((r) => ({
        foodId: r.food_id,
        similarity: r.sim,
        timesUsed: r.times_used ?? 0,
      }));
    },

    /** Alimentos + nutrientes + medidas (do alimento, do usuário e genéricas). */
    async bundles(userId: string, ids: readonly string[]): Promise<Map<string, FoodBundle>> {
      const out = new Map<string, FoodBundle>();
      if (ids.length === 0) return out;
      const rows = await db
        .select({ food: foods, nutrients: foodNutrients })
        .from(foods)
        .leftJoin(foodNutrients, eq(foodNutrients.foodId, foods.id))
        .where(and(visible(userId), inArray(foods.id, [...ids])));
      const measures = await db
        .select()
        .from(householdMeasures)
        .where(
          and(
            or(inArray(householdMeasures.foodId, [...ids]), isNull(householdMeasures.foodId)),
            or(isNull(householdMeasures.userId), eq(householdMeasures.userId, userId)),
          ),
        );
      for (const r of rows) {
        out.set(r.food.id, {
          food: r.food,
          nutrients: r.nutrients,
          measures: measures.filter((m) => m.foodId === r.food.id || m.foodId === null),
        });
      }
      return out;
    },

    async createCustomFood(
      userId: string,
      food: Omit<typeof foods.$inferInsert, 'id' | 'userId' | 'sourceCode' | 'createdAt'>,
      nutrients: Omit<typeof foodNutrients.$inferInsert, 'foodId'>,
      measures: readonly {
        unitCode: HouseholdMeasureRow['unitCode'];
        labelPt: string;
        grams: number;
      }[],
    ): Promise<string> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(foods)
          .values({ ...food, userId, sourceCode: 'user' })
          .returning({ id: foods.id });
        if (!row) throw new Error('insert foods returned no row');
        await tx.insert(foodNutrients).values({ foodId: row.id, ...nutrients });
        if (measures.length > 0) {
          await tx
            .insert(householdMeasures)
            .values(measures.map((m) => ({ ...m, foodId: row.id, userId })));
        }
        return row.id;
      });
    },

    /** Medida pessoal do usuário para um alimento (reaproveitada depois, P6.2 passo 5). */
    async addUserMeasure(
      userId: string,
      foodId: string,
      m: { unitCode: HouseholdMeasureRow['unitCode']; labelPt: string; grams: number },
    ) {
      await db
        .delete(householdMeasures)
        .where(
          and(
            eq(householdMeasures.userId, userId),
            eq(householdMeasures.foodId, foodId),
            eq(householdMeasures.unitCode, m.unitCode),
          ),
        );
      await db.insert(householdMeasures).values({ ...m, foodId, userId });
    },

    async recordUsage(userId: string, foodId: string, grams: number, unitCode: string) {
      await db
        .insert(userFoodUsage)
        .values({ userId, foodId, timesUsed: 1, lastQuantityG: grams, lastUnitCode: unitCode })
        .onConflictDoUpdate({
          target: [userFoodUsage.userId, userFoodUsage.foodId],
          set: {
            timesUsed: sql`${userFoodUsage.timesUsed} + 1`,
            lastUsedAt: new Date(),
            lastQuantityG: grams,
            lastUnitCode: unitCode,
          },
        });
    },

    /** Alias pessoal quando o usuário troca o alimento de um termo (P6.2 passo 8). */
    async addPersonalAlias(userId: string, foodId: string, aliasNormalized: string) {
      await db
        .delete(foodAliases)
        .where(
          and(eq(foodAliases.userId, userId), eq(foodAliases.aliasNormalized, aliasNormalized)),
        );
      await db.insert(foodAliases).values({ userId, foodId, aliasNormalized });
    },

    async addParserFeedback(
      userId: string,
      inputText: string,
      parsed: unknown,
      corrected: unknown,
    ) {
      await db.insert(parserFeedback).values({ userId, inputText, parsed, corrected });
    },
  };
}

export type FoodsRepository = ReturnType<typeof createFoodsRepository>;
