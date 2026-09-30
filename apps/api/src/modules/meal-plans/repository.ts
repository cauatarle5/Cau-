import { and, desc, eq, mealTemplates, type Database, type MealTemplateRow } from '@atlas/db';

export interface TemplateItem {
  slot: MealTemplateRow['slotHint'] & string;
  foodId: string;
  foodName: string;
  quantity: number;
  unitCode: string;
  grams: number;
}

/** Toda leitura e escrita exige `userId` (ADR-004). */
export function createMealPlansRepository(db: Database) {
  return {
    list(userId: string) {
      return db
        .select()
        .from(mealTemplates)
        .where(eq(mealTemplates.userId, userId))
        .orderBy(desc(mealTemplates.createdAt));
    },

    async get(userId: string, id: string) {
      const [row] = await db
        .select()
        .from(mealTemplates)
        .where(and(eq(mealTemplates.userId, userId), eq(mealTemplates.id, id)));
      return row;
    },

    async insert(
      userId: string,
      values: { name: string; slotHint: MealTemplateRow['slotHint']; items: TemplateItem[] },
    ) {
      const [row] = await db
        .insert(mealTemplates)
        .values({ ...values, userId })
        .returning();
      if (!row) throw new Error('insert meal_templates returned no row');
      return row;
    },

    async remove(userId: string, id: string): Promise<boolean> {
      const rows = await db
        .delete(mealTemplates)
        .where(and(eq(mealTemplates.userId, userId), eq(mealTemplates.id, id)))
        .returning({ id: mealTemplates.id });
      return rows.length > 0;
    },
  };
}

export type MealPlansRepository = ReturnType<typeof createMealPlansRepository>;
