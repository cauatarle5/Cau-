import {
  and,
  asc,
  eq,
  exerciseMuscles,
  exercisePreferences,
  exercises,
  inArray,
  isNull,
  muscles,
  or,
  sql,
  type Database,
  type ExerciseRow,
} from '@atlas/db';

/** Exercícios visíveis ao usuário: catálogo de sistema + os dele. */
const visible = (userId: string) => or(isNull(exercises.userId), eq(exercises.userId, userId));

export interface ExerciseBundle {
  exercise: ExerciseRow;
  muscles: { muscleCode: string; role: 'primary' | 'secondary'; weight: number }[];
  preference: 'like' | 'neutral' | 'dislike' | 'avoid' | null;
}

export interface ExerciseFilters {
  q?: string | undefined;
  muscle?: string | undefined;
  equipment?: string | undefined;
  pattern?: ExerciseRow['movementPattern'] | undefined;
  limit: number;
}

export function createExercisesRepository(db: Database) {
  async function bundles(userId: string, rows: ExerciseRow[]): Promise<ExerciseBundle[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [mus, prefs] = await Promise.all([
      db.select().from(exerciseMuscles).where(inArray(exerciseMuscles.exerciseId, ids)),
      db
        .select()
        .from(exercisePreferences)
        .where(
          and(eq(exercisePreferences.userId, userId), inArray(exercisePreferences.exerciseId, ids)),
        ),
    ]);
    const prefBy = new Map(prefs.map((p) => [p.exerciseId, p.preference]));
    return rows.map((exercise) => ({
      exercise,
      muscles: mus
        .filter((m) => m.exerciseId === exercise.id)
        .map((m) => ({ muscleCode: m.muscleCode, role: m.role, weight: m.weight })),
      preference: prefBy.get(exercise.id) ?? null,
    }));
  }

  return {
    /** Busca por nome/alias (trigram) e filtros; sem texto, ordena por nome. */
    async search(userId: string, f: ExerciseFilters): Promise<ExerciseBundle[]> {
      const conds = [visible(userId), eq(exercises.isActive, true)];
      if (f.pattern) conds.push(eq(exercises.movementPattern, f.pattern));
      if (f.equipment) conds.push(sql`${f.equipment} = any(${exercises.equipmentCodes})`);
      if (f.muscle) {
        conds.push(
          sql`exists (select 1 from ${exerciseMuscles} em where em.exercise_id = ${exercises.id} and em.muscle_code = ${f.muscle})`,
        );
      }
      const q = f.q;
      if (q) {
        conds.push(
          sql`(${exercises.nameNormalized} like ${`%${q}%`} or ${q} <% ${exercises.nameNormalized} or exists (select 1 from unnest(${exercises.aliases}) a where a like ${`%${q}%`} or a % ${q}))`,
        );
      }
      const rows = await db
        .select()
        .from(exercises)
        .where(and(...conds))
        .orderBy(
          ...(q
            ? [
                sql`greatest(word_similarity(${q}, ${exercises.nameNormalized}), coalesce((select max(similarity(a, ${q})) from unnest(${exercises.aliases}) a), 0)) desc`,
              ]
            : []),
          asc(exercises.namePt),
        )
        .limit(f.limit);
      return bundles(userId, rows);
    },

    async byIds(userId: string, ids: readonly string[]): Promise<ExerciseBundle[]> {
      if (ids.length === 0) return [];
      const rows = await db
        .select()
        .from(exercises)
        .where(and(visible(userId), inArray(exercises.id, [...ids])));
      return bundles(userId, rows);
    },

    /** Candidatos a alternativa: mesmo padrão ou com algum dos músculos primários. */
    async alternativeCandidates(userId: string, target: ExerciseBundle): Promise<ExerciseBundle[]> {
      const primary = target.muscles.filter((m) => m.role === 'primary').map((m) => m.muscleCode);
      const rows = await db
        .select()
        .from(exercises)
        .where(
          and(
            visible(userId),
            eq(exercises.isActive, true),
            sql`${exercises.id} <> ${target.exercise.id}`,
            or(
              eq(exercises.movementPattern, target.exercise.movementPattern),
              primary.length > 0
                ? sql`exists (select 1 from ${exerciseMuscles} em where em.exercise_id = ${exercises.id} and em.role = 'primary' and em.muscle_code in ${primary})`
                : sql`false`,
            ),
          ),
        );
      return bundles(userId, rows);
    },

    async createCustom(
      userId: string,
      values: Omit<typeof exercises.$inferInsert, 'id' | 'userId'>,
      muscleRows: { muscleCode: string; role: 'primary' | 'secondary'; weight: number }[],
    ): Promise<string> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(exercises)
          .values({ ...values, userId })
          .returning({ id: exercises.id });
        if (!row) throw new Error('insert exercises returned no row');
        await tx
          .insert(exerciseMuscles)
          .values(muscleRows.map((m) => ({ ...m, exerciseId: row.id })));
        return row.id;
      });
    },

    listPreferences(userId: string) {
      return db
        .select({
          exerciseId: exercisePreferences.exerciseId,
          preference: exercisePreferences.preference,
        })
        .from(exercisePreferences)
        .where(eq(exercisePreferences.userId, userId));
    },

    /** Substitui as preferências do usuário; `neutral` não é gravado. */
    async replacePreferences(
      userId: string,
      items: { exerciseId: string; preference: 'like' | 'neutral' | 'dislike' | 'avoid' }[],
    ) {
      await db.transaction(async (tx) => {
        await tx.delete(exercisePreferences).where(eq(exercisePreferences.userId, userId));
        const rows = items.filter((i) => i.preference !== 'neutral');
        if (rows.length > 0) {
          await tx.insert(exercisePreferences).values(rows.map((r) => ({ ...r, userId })));
        }
      });
    },

    listMuscles() {
      return db.select().from(muscles);
    },
  };
}

export type ExercisesRepository = ReturnType<typeof createExercisesRepository>;
