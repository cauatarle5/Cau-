import { and, eq, isNull } from 'drizzle-orm';

import { normalizeForSearch } from '@atlas/core';

import { EXERCISES, MUSCLES } from '../seeds/exercises';

import type { Database } from './client';
import { exerciseMuscles, exercises, muscles } from './schema';

/** Seed idempotente de músculos e exercícios de sistema, por nome normalizado (ADR-033). */
export async function seedExercises(db: Database): Promise<void> {
  for (const m of MUSCLES) {
    await db
      .insert(muscles)
      .values(m)
      .onConflictDoUpdate({
        target: muscles.code,
        set: { namePt: m.namePt, group: m.group, region: m.region },
      });
  }

  const existing = await db
    .select({ id: exercises.id, name: exercises.nameNormalized })
    .from(exercises)
    .where(isNull(exercises.userId));
  const idByName = new Map(existing.map((x) => [x.name, x.id]));

  for (const ex of EXERCISES) {
    const nameNormalized = normalizeForSearch(ex.namePt);
    const values = {
      namePt: ex.namePt,
      nameNormalized,
      aliases: ex.aliases.map(normalizeForSearch),
      movementPattern: ex.pattern,
      mechanics: ex.mechanics,
      laterality: ex.laterality,
      equipmentCodes: ex.equipment,
      loadType: ex.loadType,
      defaultIncrementKg: ex.incrementKg,
      contraindicationTags: ex.contraindications,
    };
    await db.transaction(async (tx) => {
      let id = idByName.get(nameNormalized);
      if (id) {
        await tx
          .update(exercises)
          .set(values)
          .where(and(eq(exercises.id, id), isNull(exercises.userId)));
        await tx.delete(exerciseMuscles).where(eq(exerciseMuscles.exerciseId, id));
      } else {
        const [row] = await tx.insert(exercises).values(values).returning({ id: exercises.id });
        if (!row) throw new Error('insert exercises returned no row');
        id = row.id;
        idByName.set(nameNormalized, id);
      }
      const rows = [
        ...ex.primary.map((m) => ({
          exerciseId: id,
          muscleCode: m,
          role: 'primary' as const,
          weight: 1,
        })),
        ...ex.secondary
          .filter((m) => !ex.primary.includes(m))
          .map((m) => ({ exerciseId: id, muscleCode: m, role: 'secondary' as const, weight: 0.5 })),
      ];
      if (rows.length > 0) await tx.insert(exerciseMuscles).values(rows);
    });
  }
}
