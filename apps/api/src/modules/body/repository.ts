import {
  and,
  bodyMeasurements,
  desc,
  eq,
  isNull,
  lt,
  or,
  sql,
  type BodyMeasurementRow,
  type Database,
} from '@atlas/db';

export type MeasurementValues = Omit<
  typeof bodyMeasurements.$inferInsert,
  'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;

const active = (userId: string) =>
  and(eq(bodyMeasurements.userId, userId), isNull(bodyMeasurements.deletedAt));

/** Medidas corporais; toda query filtra por `userId` e ignora excluídas. */
export function createBodyRepository(db: Database) {
  return {
    async create(userId: string, values: MeasurementValues): Promise<BodyMeasurementRow> {
      const [row] = await db
        .insert(bodyMeasurements)
        .values({ userId, ...values })
        .returning();
      if (!row) throw new Error('insert body_measurements returned no row');
      return row;
    },

    async get(userId: string, id: string) {
      const [row] = await db
        .select()
        .from(bodyMeasurements)
        .where(and(active(userId), eq(bodyMeasurements.id, id)))
        .limit(1);
      return row;
    },

    /** Mais recentes primeiro; cursor = (date, id) da última linha. */
    list(userId: string, limit: number, cursor: { date: string; id: string } | null) {
      const after = cursor
        ? or(
            lt(bodyMeasurements.date, cursor.date),
            and(eq(bodyMeasurements.date, cursor.date), lt(bodyMeasurements.id, cursor.id)),
          )
        : undefined;
      return db
        .select()
        .from(bodyMeasurements)
        .where(and(active(userId), after))
        .orderBy(desc(bodyMeasurements.date), desc(bodyMeasurements.id))
        .limit(limit);
    },

    async update(userId: string, id: string, values: Partial<MeasurementValues>) {
      const [row] = await db
        .update(bodyMeasurements)
        .set(values)
        .where(and(active(userId), eq(bodyMeasurements.id, id)))
        .returning();
      return row;
    },

    async softDelete(userId: string, id: string): Promise<boolean> {
      const rows = await db
        .update(bodyMeasurements)
        .set({ deletedAt: new Date() })
        .where(and(active(userId), eq(bodyMeasurements.id, id)))
        .returning({ id: bodyMeasurements.id });
      return rows.length > 0;
    },

    /** Todas as pesagens (para a tendência). */
    weighIns(userId: string) {
      return db
        .select({
          id: bodyMeasurements.id,
          date: bodyMeasurements.date,
          weightKg: bodyMeasurements.weightKg,
        })
        .from(bodyMeasurements)
        .where(and(active(userId), sql`${bodyMeasurements.weightKg} is not null`))
        .orderBy(bodyMeasurements.date);
    },

    async latestBodyFat(userId: string) {
      const [row] = await db
        .select({
          date: bodyMeasurements.date,
          pct: bodyMeasurements.bodyFatPct,
          method: bodyMeasurements.bodyFatMethod,
        })
        .from(bodyMeasurements)
        .where(and(active(userId), sql`${bodyMeasurements.bodyFatPct} is not null`))
        .orderBy(desc(bodyMeasurements.date), desc(bodyMeasurements.measuredAt))
        .limit(1);
      return row;
    },
  };
}

export type BodyRepository = ReturnType<typeof createBodyRepository>;
