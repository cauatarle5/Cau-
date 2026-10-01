import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  mesocycles,
  personalRecords,
  plannedWorkouts,
  programs,
  sessionExercises,
  setLogs,
  sql,
  templateExercises,
  workoutSessions,
  workoutTemplates,
  type Database,
  type MesocycleRow,
  type PersonalRecordRow,
  type PlannedWorkoutRow,
  type ProgramRow,
  type SessionExerciseRow,
  type SetLogRow,
  type TemplateExerciseRow,
  type WorkoutSessionRow,
  type WorkoutTemplateRow,
} from '@atlas/db';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface ProgramBundle {
  program: ProgramRow;
  templates: { template: WorkoutTemplateRow; exercises: TemplateExerciseRow[] }[];
}

export interface NewTemplate {
  name: string;
  dayOrder: number;
  focusMuscles: string[];
  estimatedMinutes: number | null;
  exercises: Omit<typeof templateExercises.$inferInsert, 'id' | 'workoutTemplateId'>[];
}

export interface SessionBundle {
  session: WorkoutSessionRow;
  exercises: SessionExerciseRow[];
  sets: SetLogRow[];
  records: PersonalRecordRow[];
}

/** Série com o contexto da sessão (para histórico, recordes e progresso). */
export interface HistorySet extends SetLogRow {
  sessionId: string;
  sessionStartedAt: Date;
  sessionEndedAt: Date | null;
  sessionAdapted: boolean;
  date: string;
  exerciseId: string;
}

const liveSession = (userId: string) =>
  and(eq(workoutSessions.userId, userId), isNull(workoutSessions.deletedAt));

const historyColumns = {
  set: setLogs,
  sessionId: workoutSessions.id,
  sessionStartedAt: workoutSessions.startedAt,
  sessionEndedAt: workoutSessions.endedAt,
  sessionAdapted: workoutSessions.adapted,
  date: workoutSessions.date,
  exerciseId: sessionExercises.exerciseId,
};

function toHistory(
  rows: {
    set: SetLogRow;
    sessionId: string;
    sessionStartedAt: Date;
    sessionEndedAt: Date | null;
    sessionAdapted: boolean;
    date: string;
    exerciseId: string;
  }[],
): HistorySet[] {
  return rows.map((r) => ({
    ...r.set,
    sessionId: r.sessionId,
    sessionStartedAt: r.sessionStartedAt,
    sessionEndedAt: r.sessionEndedAt,
    sessionAdapted: r.sessionAdapted,
    date: r.date,
    exerciseId: r.exerciseId,
  }));
}

type Executor = Database | Tx;

/** Séries do usuário para exercícios, em sessões ativas, na ordem de execução. */
async function historySets(
  db: Executor,
  userId: string,
  exerciseIds: readonly string[],
  range?: { from: string; to: string },
): Promise<HistorySet[]> {
  if (exerciseIds.length === 0) return [];
  const rows = await db
    .select(historyColumns)
    .from(setLogs)
    .innerJoin(sessionExercises, eq(sessionExercises.id, setLogs.sessionExerciseId))
    .innerJoin(workoutSessions, eq(workoutSessions.id, sessionExercises.sessionId))
    .where(
      and(
        liveSession(userId),
        inArray(sessionExercises.exerciseId, [...exerciseIds]),
        ...(range
          ? [gte(workoutSessions.date, range.from), lte(workoutSessions.date, range.to)]
          : []),
      ),
    )
    .orderBy(
      asc(workoutSessions.startedAt),
      asc(workoutSessions.id),
      asc(setLogs.setIndex),
      asc(setLogs.loggedAt),
      asc(setLogs.id),
    );
  return toHistory(rows);
}

/** Toda leitura e escrita exige `userId` (ADR-004); filhos são checados pela sessão/programa. */
export function createTrainingRepository(db: Database) {
  async function programBundles(rows: ProgramRow[]): Promise<ProgramBundle[]> {
    if (rows.length === 0) return [];
    const tpls = await db
      .select()
      .from(workoutTemplates)
      .where(
        inArray(
          workoutTemplates.programId,
          rows.map((p) => p.id),
        ),
      )
      .orderBy(asc(workoutTemplates.dayOrder));
    const exs = tpls.length
      ? await db
          .select()
          .from(templateExercises)
          .where(
            inArray(
              templateExercises.workoutTemplateId,
              tpls.map((t) => t.id),
            ),
          )
          .orderBy(asc(templateExercises.order))
      : [];
    return rows.map((program) => ({
      program,
      templates: tpls
        .filter((t) => t.programId === program.id)
        .map((template) => ({
          template,
          exercises: exs.filter((e) => e.workoutTemplateId === template.id),
        })),
    }));
  }

  async function insertTemplates(tx: Tx, programId: string, templates: readonly NewTemplate[]) {
    for (const t of templates) {
      const [tpl] = await tx
        .insert(workoutTemplates)
        .values({
          programId,
          name: t.name,
          dayOrder: t.dayOrder,
          focusMuscles: t.focusMuscles,
          estimatedMinutes: t.estimatedMinutes,
        })
        .returning({ id: workoutTemplates.id });
      if (!tpl) throw new Error('insert workout_templates returned no row');
      if (t.exercises.length > 0) {
        await tx
          .insert(templateExercises)
          .values(t.exercises.map((e) => ({ ...e, workoutTemplateId: tpl.id })));
      }
    }
  }

  /** Serializa ativações do mesmo usuário (índice parcial `programs_one_active_uq`). */
  async function deactivateOthers(tx: Tx, userId: string) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`programs:${userId}`}))`);
    await tx
      .update(programs)
      .set({ status: 'archived' })
      .where(and(eq(programs.userId, userId), eq(programs.status, 'active')));
  }

  return {
    // Programas -----------------------------------------------------------

    async listPrograms(userId: string) {
      const rows = await db
        .select()
        .from(programs)
        .where(eq(programs.userId, userId))
        .orderBy(desc(programs.createdAt));
      return programBundles(rows);
    },

    async getProgram(userId: string, id: string): Promise<ProgramBundle | undefined> {
      const rows = await db
        .select()
        .from(programs)
        .where(and(eq(programs.userId, userId), eq(programs.id, id)));
      return (await programBundles(rows))[0];
    },

    async createProgram(
      userId: string,
      values: { name: string; notes: string | null; activate: boolean; startDate: string | null },
      templates: readonly NewTemplate[],
    ): Promise<string> {
      return db.transaction(async (tx) => {
        if (values.activate) await deactivateOthers(tx, userId);
        const [row] = await tx
          .insert(programs)
          .values({
            userId,
            name: values.name,
            notes: values.notes,
            status: values.activate ? 'active' : 'draft',
            startDate: values.activate ? values.startDate : null,
            generatedBy: 'manual',
          })
          .returning({ id: programs.id });
        if (!row) throw new Error('insert programs returned no row');
        await insertTemplates(tx, row.id, templates);
        return row.id;
      });
    },

    /** Templates substituídos: sessões antigas mantêm snapshot e perdem só o vínculo. */
    async updateProgram(
      userId: string,
      id: string,
      values: Partial<Pick<ProgramRow, 'name' | 'notes' | 'status' | 'endDate'>>,
      templates: readonly NewTemplate[] | undefined,
    ): Promise<boolean> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .update(programs)
          .set({ ...values, updatedAt: new Date() })
          .where(and(eq(programs.userId, userId), eq(programs.id, id)))
          .returning({ id: programs.id });
        if (!row) return false;
        if (templates) {
          await tx.delete(workoutTemplates).where(eq(workoutTemplates.programId, id));
          await insertTemplates(tx, id, templates);
        }
        return true;
      });
    },

    async activateProgram(userId: string, id: string, today: string): Promise<boolean> {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select({ status: programs.status, startDate: programs.startDate })
          .from(programs)
          .where(and(eq(programs.userId, userId), eq(programs.id, id)));
        if (!current) return false;
        if (current.status === 'active') return true;
        await deactivateOthers(tx, userId);
        await tx
          .update(programs)
          .set({ status: 'active', startDate: current.startDate ?? today, endDate: null })
          .where(and(eq(programs.userId, userId), eq(programs.id, id)));
        return true;
      });
    },

    async getTemplate(userId: string, templateId: string) {
      const [row] = await db
        .select({ template: workoutTemplates })
        .from(workoutTemplates)
        .innerJoin(programs, eq(programs.id, workoutTemplates.programId))
        .where(and(eq(programs.userId, userId), eq(workoutTemplates.id, templateId)));
      if (!row) return undefined;
      const exercises = await db
        .select()
        .from(templateExercises)
        .where(eq(templateExercises.workoutTemplateId, templateId))
        .orderBy(asc(templateExercises.order));
      return { template: row.template, exercises };
    },

    // Sessões -------------------------------------------------------------

    /** Idempotente por id: devolve `false` se o id já existe (do mesmo usuário ou não). */
    async createSession(
      userId: string,
      values: Omit<typeof workoutSessions.$inferInsert, 'userId'>,
      exercises: Omit<typeof sessionExercises.$inferInsert, 'sessionId'>[],
    ): Promise<{ id: string; created: boolean }> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(workoutSessions)
          .values({ ...values, userId })
          .onConflictDoNothing()
          .returning({ id: workoutSessions.id });
        if (!row) return { id: values.id ?? '', created: false };
        if (exercises.length > 0) {
          await tx
            .insert(sessionExercises)
            .values(exercises.map((e) => ({ ...e, sessionId: row.id })));
        }
        return { id: row.id, created: true };
      });
    },

    async getSession(userId: string, id: string): Promise<SessionBundle | undefined> {
      const [session] = await db
        .select()
        .from(workoutSessions)
        .where(and(liveSession(userId), eq(workoutSessions.id, id)));
      if (!session) return undefined;
      const exercises = await db
        .select()
        .from(sessionExercises)
        .where(eq(sessionExercises.sessionId, id))
        .orderBy(asc(sessionExercises.order), asc(sessionExercises.createdAt));
      const sets = exercises.length
        ? await db
            .select()
            .from(setLogs)
            .where(
              inArray(
                setLogs.sessionExerciseId,
                exercises.map((e) => e.id),
              ),
            )
            .orderBy(asc(setLogs.setIndex), asc(setLogs.loggedAt))
        : [];
      const records = await db
        .select()
        .from(personalRecords)
        .where(and(eq(personalRecords.userId, userId), eq(personalRecords.sessionId, id)))
        .orderBy(asc(personalRecords.achievedAt));
      return { session, exercises, sets, records };
    },

    /** Existe com esse id para outro usuário (ou apagada)? Usado para responder 409/404. */
    async sessionIdTaken(id: string): Promise<boolean> {
      const [row] = await db
        .select({ id: workoutSessions.id })
        .from(workoutSessions)
        .where(eq(workoutSessions.id, id));
      return !!row;
    },

    async listSessions(userId: string, from: string, to: string) {
      const sessions = await db
        .select()
        .from(workoutSessions)
        .where(
          and(liveSession(userId), gte(workoutSessions.date, from), lte(workoutSessions.date, to)),
        )
        .orderBy(desc(workoutSessions.startedAt));
      const ids = sessions.map((s) => s.id);
      const exercises = ids.length
        ? await db.select().from(sessionExercises).where(inArray(sessionExercises.sessionId, ids))
        : [];
      const sets = exercises.length
        ? await db
            .select()
            .from(setLogs)
            .where(
              inArray(
                setLogs.sessionExerciseId,
                exercises.map((e) => e.id),
              ),
            )
        : [];
      const records = ids.length
        ? await db
            .select({ sessionId: personalRecords.sessionId })
            .from(personalRecords)
            .where(and(eq(personalRecords.userId, userId), inArray(personalRecords.sessionId, ids)))
        : [];
      return { sessions, exercises, sets, records };
    },

    async updateSession(
      userId: string,
      id: string,
      values: Partial<typeof workoutSessions.$inferInsert>,
    ): Promise<boolean> {
      const rows = await db
        .update(workoutSessions)
        .set({ ...values, updatedAt: new Date() })
        .where(and(liveSession(userId), eq(workoutSessions.id, id)))
        .returning({ id: workoutSessions.id });
      return rows.length > 0;
    },

    async softDeleteSession(userId: string, id: string): Promise<boolean> {
      const rows = await db
        .update(workoutSessions)
        .set({ deletedAt: new Date() })
        .where(and(liveSession(userId), eq(workoutSessions.id, id)))
        .returning({ id: workoutSessions.id });
      return rows.length > 0;
    },

    /** Exercício da sessão com a sessão dona (checa usuário). */
    async getSessionExercise(userId: string, id: string) {
      const [row] = await db
        .select({ exercise: sessionExercises, session: workoutSessions })
        .from(sessionExercises)
        .innerJoin(workoutSessions, eq(workoutSessions.id, sessionExercises.sessionId))
        .where(and(liveSession(userId), eq(sessionExercises.id, id)));
      return row;
    },

    async nextExerciseOrder(sessionId: string): Promise<number> {
      const [row] = await db
        .select({ max: sql<number | null>`max(${sessionExercises.order})` })
        .from(sessionExercises)
        .where(eq(sessionExercises.sessionId, sessionId));
      return (row?.max ?? -1) + 1;
    },

    /** Idempotente por id. */
    async insertSessionExercise(values: typeof sessionExercises.$inferInsert): Promise<boolean> {
      const rows = await db
        .insert(sessionExercises)
        .values(values)
        .onConflictDoNothing()
        .returning({ id: sessionExercises.id });
      return rows.length > 0;
    },

    async sessionExerciseIdTaken(id: string): Promise<boolean> {
      const [row] = await db
        .select({ id: sessionExercises.id })
        .from(sessionExercises)
        .where(eq(sessionExercises.id, id));
      return !!row;
    },

    async updateSessionExercise(id: string, values: Partial<typeof sessionExercises.$inferInsert>) {
      await db.update(sessionExercises).set(values).where(eq(sessionExercises.id, id));
    },

    async markPendingExercises(sessionId: string) {
      await db.execute(sql`
        update ${sessionExercises} se
        set status = case when exists (
          select 1 from ${setLogs} s where s.session_exercise_id = se.id and s.completed
        ) then 'done'::session_exercise_status else 'skipped'::session_exercise_status end
        where se.session_id = ${sessionId} and se.status = 'pending'
      `);
    },

    async countSets(sessionExerciseId: string): Promise<number> {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(setLogs)
        .where(eq(setLogs.sessionExerciseId, sessionExerciseId));
      return row?.n ?? 0;
    },

    // Séries --------------------------------------------------------------

    async getSet(userId: string, id: string) {
      const [row] = await db
        .select({ set: setLogs, exercise: sessionExercises, session: workoutSessions })
        .from(setLogs)
        .innerJoin(sessionExercises, eq(sessionExercises.id, setLogs.sessionExerciseId))
        .innerJoin(workoutSessions, eq(workoutSessions.id, sessionExercises.sessionId))
        .where(and(liveSession(userId), eq(setLogs.id, id)));
      return row;
    },

    async setIdTaken(id: string): Promise<boolean> {
      const [row] = await db.select({ id: setLogs.id }).from(setLogs).where(eq(setLogs.id, id));
      return !!row;
    },

    /** Idempotente por id. */
    async insertSet(values: typeof setLogs.$inferInsert): Promise<SetLogRow | undefined> {
      const [row] = await db.insert(setLogs).values(values).onConflictDoNothing().returning();
      return row;
    },

    async updateSet(id: string, values: Partial<typeof setLogs.$inferInsert>) {
      const [row] = await db.update(setLogs).set(values).where(eq(setLogs.id, id)).returning();
      return row;
    },

    async deleteSet(id: string) {
      await db.delete(setLogs).where(eq(setLogs.id, id));
    },

    // Histórico e recordes -----------------------------------------------

    /** Séries do usuário para exercícios, em sessões ativas, com `date` opcionalmente limitado. */
    historySets(
      userId: string,
      exerciseIds: readonly string[],
      range?: { from: string; to: string },
    ): Promise<HistorySet[]> {
      return historySets(db, userId, exerciseIds, range);
    },

    /**
     * Recalcula os recordes de um exercício dentro de uma transação com trava por
     * (usuário, exercício): lê o histórico, `compute` gera as linhas, substitui todas.
     */
    async rebuildExerciseRecords(
      userId: string,
      exerciseId: string,
      compute: (
        history: HistorySet[],
      ) => Omit<typeof personalRecords.$inferInsert, 'userId' | 'exerciseId'>[],
    ) {
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`records:${userId}:${exerciseId}`}))`,
        );
        const rows = compute(await historySets(tx, userId, [exerciseId]));
        await tx
          .delete(personalRecords)
          .where(
            and(eq(personalRecords.userId, userId), eq(personalRecords.exerciseId, exerciseId)),
          );
        if (rows.length > 0) {
          await tx.insert(personalRecords).values(rows.map((r) => ({ ...r, userId, exerciseId })));
        }
      });
    },

    /** Séries de todas as sessões num intervalo de dias (volume semanal). */
    async setsInRange(userId: string, from: string, to: string): Promise<HistorySet[]> {
      const rows = await db
        .select(historyColumns)
        .from(setLogs)
        .innerJoin(sessionExercises, eq(sessionExercises.id, setLogs.sessionExerciseId))
        .innerJoin(workoutSessions, eq(workoutSessions.id, sessionExercises.sessionId))
        .where(
          and(liveSession(userId), gte(workoutSessions.date, from), lte(workoutSessions.date, to)),
        );
      return toHistory(rows);
    },

    async setRecords(userId: string, setLogId: string) {
      return db
        .select()
        .from(personalRecords)
        .where(and(eq(personalRecords.userId, userId), eq(personalRecords.setLogId, setLogId)));
    },

    // Agenda (ADR-043) ---------------------------------------------------

    /** Carga sRPE das sessões com RPE e duração (P8.5). */
    async sessionLoads(userId: string, from: string, to: string) {
      const rows = await db
        .select({
          date: workoutSessions.date,
          rpe: workoutSessions.sessionRpe,
          minutes: workoutSessions.durationMin,
        })
        .from(workoutSessions)
        .where(
          and(
            liveSession(userId),
            gte(workoutSessions.date, from),
            lte(workoutSessions.date, to),
            isNotNull(workoutSessions.sessionRpe),
            isNotNull(workoutSessions.durationMin),
          ),
        );
      return rows;
    },

    /**
     * Recria a agenda: apaga planejados futuros ainda não feitos (de qualquer programa) e os
     * mesociclos deste programa; grava mesociclos e planejados novos.
     */
    async replaceAgenda(
      userId: string,
      programId: string,
      today: string,
      mesos: Omit<typeof mesocycles.$inferInsert, 'programId'>[],
      planned: (Omit<typeof plannedWorkouts.$inferInsert, 'userId' | 'mesocycleId'> & {
        mesocycleOrder: number;
      })[],
    ) {
      await db.transaction(async (tx) => {
        await tx
          .delete(plannedWorkouts)
          .where(
            and(
              eq(plannedWorkouts.userId, userId),
              gte(plannedWorkouts.date, today),
              inArray(plannedWorkouts.status, ['planned', 'moved', 'skipped']),
            ),
          );
        const owned = await tx
          .select({ id: programs.id })
          .from(programs)
          .where(and(eq(programs.userId, userId), eq(programs.id, programId)));
        if (owned.length === 0) return;
        await tx.delete(mesocycles).where(eq(mesocycles.programId, programId));
        if (mesos.length === 0) return;
        const inserted = await tx
          .insert(mesocycles)
          .values(mesos.map((m) => ({ ...m, programId })))
          .returning({ id: mesocycles.id, order: mesocycles.order });
        const byOrder = new Map(inserted.map((m) => [m.order, m.id]));
        if (planned.length > 0) {
          await tx.insert(plannedWorkouts).values(
            planned.map(({ mesocycleOrder, ...p }) => ({
              ...p,
              userId,
              mesocycleId: byOrder.get(mesocycleOrder) ?? null,
            })),
          );
        }
      });
    },

    async listPlanned(
      userId: string,
      opts: { from?: string; to?: string; ids?: readonly string[] },
    ) {
      const rows = await db
        .select({
          planned: plannedWorkouts,
          templateName: workoutTemplates.name,
          programId: workoutTemplates.programId,
          meso: mesocycles,
        })
        .from(plannedWorkouts)
        .innerJoin(workoutTemplates, eq(workoutTemplates.id, plannedWorkouts.workoutTemplateId))
        .leftJoin(mesocycles, eq(mesocycles.id, plannedWorkouts.mesocycleId))
        .where(
          and(
            eq(plannedWorkouts.userId, userId),
            ...(opts.from ? [gte(plannedWorkouts.date, opts.from)] : []),
            ...(opts.to ? [lte(plannedWorkouts.date, opts.to)] : []),
            ...(opts.ids ? [inArray(plannedWorkouts.id, [...opts.ids])] : []),
          ),
        )
        .orderBy(asc(plannedWorkouts.date));
      const ids = rows.map((r) => r.planned.id);
      const sessions = ids.length
        ? await db
            .select({ id: workoutSessions.id, plannedWorkoutId: workoutSessions.plannedWorkoutId })
            .from(workoutSessions)
            .where(and(liveSession(userId), inArray(workoutSessions.plannedWorkoutId, ids)))
        : [];
      return rows.map((r) => ({
        ...r,
        sessionId: sessions.find((x) => x.plannedWorkoutId === r.planned.id)?.id ?? null,
      }));
    },

    async updatePlanned(
      userId: string,
      id: string,
      values: Partial<typeof plannedWorkouts.$inferInsert>,
    ) {
      const rows = await db
        .update(plannedWorkouts)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(plannedWorkouts.userId, userId), eq(plannedWorkouts.id, id)))
        .returning({ id: plannedWorkouts.id });
      return rows.length > 0;
    },

    async exerciseRecords(userId: string, exerciseId: string) {
      return db
        .select()
        .from(personalRecords)
        .innerJoin(workoutSessions, eq(workoutSessions.id, personalRecords.sessionId))
        .where(
          and(
            liveSession(userId),
            eq(personalRecords.userId, userId),
            eq(personalRecords.exerciseId, exerciseId),
          ),
        )
        .orderBy(desc(personalRecords.achievedAt));
    },
  };
}

export type PlannedRow = Awaited<
  ReturnType<ReturnType<typeof createTrainingRepository>['listPlanned']>
>[number];
export type { MesocycleRow, PlannedWorkoutRow };

export type TrainingRepository = ReturnType<typeof createTrainingRepository>;
