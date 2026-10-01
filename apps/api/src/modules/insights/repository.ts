import {
  and,
  dailyCheckins,
  desc,
  energyEstimates,
  eq,
  exercises,
  gt,
  gte,
  insights,
  isNull,
  lt,
  lte,
  personalRecords,
  sql,
  users,
  workoutSessions,
  type Database,
  type InsightRow,
} from '@atlas/db';

export type NewEnergyEstimate = Omit<
  typeof energyEstimates.$inferInsert,
  'id' | 'userId' | 'createdAt' | 'updatedAt'
>;
export type NewInsight = Omit<
  typeof insights.$inferInsert,
  'id' | 'userId' | 'generatedAt' | 'updatedAt' | 'status'
>;

export interface DailyIntake {
  date: string;
  loggedMeals: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

const num = (key: string) =>
  sql<number>`coalesce(sum((${sql.raw('i.nutrients_snapshot')}->>${key})::float8), 0)::float8`;

/** Dados agregados para métricas, GET adaptativo e insights; toda query filtra por `userId`. */
export function createInsightsRepository(db: Database) {
  return {
    /** Consumido por dia (só refeições registradas) e quantas refeições foram registradas. */
    async dailyIntake(userId: string, from: string, to: string): Promise<DailyIntake[]> {
      const rows = await db.execute<{
        date: string;
        logged_meals: number;
        kcal: number;
        protein_g: number;
        carbs_g: number;
        fat_g: number;
      }>(sql`
        select m.date::text as date,
               count(distinct m.id)::int as logged_meals,
               ${num('kcal')} as kcal,
               ${num('proteinG')} as protein_g,
               ${num('carbsG')} as carbs_g,
               ${num('fatG')} as fat_g
          from meals m
          left join meal_items i on i.meal_id = m.id
         where m.user_id = ${userId}
           and m.deleted_at is null
           and m.status = 'logged'
           and m.date between ${from} and ${to}
         group by m.date
         order by m.date`);
      return rows.rows.map((r) => ({
        date: r.date,
        loggedMeals: r.logged_meals,
        kcal: r.kcal,
        proteinG: r.protein_g,
        carbsG: r.carbs_g,
        fatG: r.fat_g,
      }));
    },

    checkins(userId: string, from: string, to: string) {
      return db
        .select({
          date: dailyCheckins.date,
          sleepHours: dailyCheckins.sleepHours,
          sleepQuality: dailyCheckins.sleepQuality,
          readiness: dailyCheckins.readinessScore,
        })
        .from(dailyCheckins)
        .where(
          and(
            eq(dailyCheckins.userId, userId),
            gte(dailyCheckins.date, from),
            lte(dailyCheckins.date, to),
          ),
        )
        .orderBy(dailyCheckins.date);
    },

    /** Recordes de e1RM em sessões a partir de `from` (data da sessão). */
    e1rmRecordsSince(userId: string, from: string) {
      return db
        .select({
          exerciseId: personalRecords.exerciseId,
          name: exercises.namePt,
          value: personalRecords.value,
          date: workoutSessions.date,
        })
        .from(personalRecords)
        .innerJoin(exercises, eq(exercises.id, personalRecords.exerciseId))
        .innerJoin(workoutSessions, eq(workoutSessions.id, personalRecords.sessionId))
        .where(
          and(
            eq(personalRecords.userId, userId),
            eq(personalRecords.recordType, 'e1rm'),
            isNull(workoutSessions.deletedAt),
            gte(workoutSessions.date, from),
          ),
        );
    },

    // GET adaptativo ------------------------------------------------------

    async latestEstimate(userId: string, opts: { before?: string; usable?: boolean } = {}) {
      const [row] = await db
        .select()
        .from(energyEstimates)
        .where(
          and(
            eq(energyEstimates.userId, userId),
            ...(opts.before ? [lt(energyEstimates.weekStart, opts.before)] : []),
            ...(opts.usable ? [sql`${energyEstimates.confidence} <> 'low'`] : []),
          ),
        )
        .orderBy(desc(energyEstimates.weekStart))
        .limit(1);
      return row;
    },

    listEstimates(userId: string, limit: number) {
      return db
        .select()
        .from(energyEstimates)
        .where(eq(energyEstimates.userId, userId))
        .orderBy(desc(energyEstimates.weekStart))
        .limit(limit);
    },

    async upsertEstimate(userId: string, values: NewEnergyEstimate) {
      const [row] = await db
        .insert(energyEstimates)
        .values({ ...values, userId })
        .onConflictDoUpdate({
          target: [energyEstimates.userId, energyEstimates.weekStart],
          set: { ...values, updatedAt: new Date() },
        })
        .returning();
      if (!row) throw new Error('upsert energy_estimates returned no row');
      return row;
    },

    // Insights -------------------------------------------------------------

    /**
     * Grava os candidatos com deduplicação por (usuário, tipo, chave), sob trava por usuário
     * (ADR-050): ativo é atualizado mantendo o status; dispensado ativo fica intocado;
     * expirado volta como novo.
     */
    async saveInsights(userId: string, now: Date, rows: readonly NewInsight[]) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`insights:${userId}`}))`);
        for (const r of rows) {
          const [existing] = await tx
            .select()
            .from(insights)
            .where(
              and(
                eq(insights.userId, userId),
                eq(insights.type, r.type),
                eq(insights.dedupKey, r.dedupKey),
              ),
            );
          if (!existing) {
            await tx.insert(insights).values({ ...r, userId, generatedAt: now });
            continue;
          }
          const active = existing.expiresAt > now;
          if (active && existing.status === 'dismissed') continue;
          await tx
            .update(insights)
            .set({
              ...r,
              ...(active ? {} : { status: 'new' as const, generatedAt: now }),
              updatedAt: now,
            })
            .where(eq(insights.id, existing.id));
        }
      });
    },

    listInsights(userId: string, now: Date, status?: InsightRow['status']) {
      return db
        .select()
        .from(insights)
        .where(
          and(
            eq(insights.userId, userId),
            gt(insights.expiresAt, now),
            status ? eq(insights.status, status) : sql`${insights.status} <> 'dismissed'`,
          ),
        )
        .orderBy(desc(insights.generatedAt));
    },

    async updateInsightStatus(userId: string, id: string, status: InsightRow['status']) {
      const [row] = await db
        .update(insights)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(insights.userId, userId), eq(insights.id, id)))
        .returning();
      return row;
    },

    // Jobs -----------------------------------------------------------------

    /** Usuários e fusos, para os jobs que rodam na hora local de cada um (ADR-049). */
    usersWithTimezone() {
      return db.select({ id: users.id, timezone: users.timezone }).from(users);
    },

    async purgeIdempotencyKeys(before: Date) {
      await db.execute(sql`delete from idempotency_keys where created_at < ${before}`);
    },
  };
}

export type InsightsRepository = ReturnType<typeof createInsightsRepository>;
