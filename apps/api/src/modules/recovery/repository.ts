import {
  activities,
  and,
  asc,
  dailyCheckins,
  eq,
  gte,
  isNull,
  lte,
  painReports,
  type Database,
} from '@atlas/db';

const liveActivity = (userId: string) =>
  and(eq(activities.userId, userId), isNull(activities.deletedAt));

/** Toda leitura e escrita exige `userId` (ADR-004). */
export function createRecoveryRepository(db: Database) {
  return {
    listActivities(userId: string, from: string, to: string) {
      return db
        .select()
        .from(activities)
        .where(and(liveActivity(userId), gte(activities.date, from), lte(activities.date, to)))
        .orderBy(asc(activities.date), asc(activities.createdAt));
    },

    async getActivity(userId: string, id: string) {
      const [row] = await db
        .select()
        .from(activities)
        .where(and(liveActivity(userId), eq(activities.id, id)));
      return row;
    },

    async createActivity(userId: string, values: Omit<typeof activities.$inferInsert, 'userId'>) {
      const [row] = await db
        .insert(activities)
        .values({ ...values, userId })
        .returning();
      if (!row) throw new Error('insert activities returned no row');
      return row;
    },

    async updateActivity(
      userId: string,
      id: string,
      values: Partial<typeof activities.$inferInsert>,
    ) {
      const [row] = await db
        .update(activities)
        .set({ ...values, updatedAt: new Date() })
        .where(and(liveActivity(userId), eq(activities.id, id)))
        .returning();
      return row;
    },

    async deleteActivity(userId: string, id: string) {
      const rows = await db
        .update(activities)
        .set({ deletedAt: new Date() })
        .where(and(liveActivity(userId), eq(activities.id, id)))
        .returning({ id: activities.id });
      return rows.length > 0;
    },

    async getCheckin(userId: string, date: string) {
      const [row] = await db
        .select()
        .from(dailyCheckins)
        .where(and(eq(dailyCheckins.userId, userId), eq(dailyCheckins.date, date)));
      return row;
    },

    async upsertCheckin(
      userId: string,
      date: string,
      values: Omit<typeof dailyCheckins.$inferInsert, 'userId' | 'date'>,
    ) {
      const [row] = await db
        .insert(dailyCheckins)
        .values({ ...values, userId, date })
        .onConflictDoUpdate({
          target: [dailyCheckins.userId, dailyCheckins.date],
          set: { ...values, updatedAt: new Date() },
        })
        .returning();
      if (!row) throw new Error('upsert daily_checkins returned no row');
      return row;
    },

    async createPain(userId: string, values: Omit<typeof painReports.$inferInsert, 'userId'>) {
      const [row] = await db
        .insert(painReports)
        .values({ ...values, userId })
        .returning();
      if (!row) throw new Error('insert pain_reports returned no row');
      return row;
    },

    listPain(userId: string, from: string, to: string) {
      return db
        .select()
        .from(painReports)
        .where(
          and(
            eq(painReports.userId, userId),
            gte(painReports.date, from),
            lte(painReports.date, to),
          ),
        )
        .orderBy(asc(painReports.date));
    },
  };
}

export type RecoveryRepository = ReturnType<typeof createRecoveryRepository>;
