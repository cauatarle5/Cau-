import type { z } from 'zod';

import {
  and,
  availability,
  desc,
  eq,
  equipment,
  equipmentAccess,
  goals,
  limitations,
  lte,
  profiles,
  sports,
  type Database,
} from '@atlas/db';
import type { AvailabilityItem, GoalInput, ProfileInput, SportItem } from '@atlas/schemas';
import type { limitationInputSchema, limitationPatchSchema } from '@atlas/schemas';

type LimitationInput = z.infer<typeof limitationInputSchema>;
type LimitationPatch = z.infer<typeof limitationPatchSchema>;

/** Toda leitura e escrita exige `userId` (ADR-004). */
export function createProfileRepository(db: Database) {
  return {
    async getProfile(userId: string) {
      const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
      return row;
    },

    async upsertProfile(userId: string, input: ProfileInput) {
      const values = {
        ...input,
        trainingAgeYears: input.trainingAgeYears ?? null,
        notes: input.notes ?? null,
      };
      const [row] = await db
        .insert(profiles)
        .values({ userId, ...values })
        .onConflictDoUpdate({ target: profiles.userId, set: values })
        .returning();
      if (!row) throw new Error('upsert profiles returned no row');
      return row;
    },

    listAvailability(userId: string) {
      return db
        .select()
        .from(availability)
        .where(eq(availability.userId, userId))
        .orderBy(availability.weekday, availability.startTime);
    },

    async replaceAvailability(userId: string, items: readonly AvailabilityItem[]) {
      await db.transaction(async (tx) => {
        await tx.delete(availability).where(eq(availability.userId, userId));
        if (items.length > 0) {
          await tx.insert(availability).values(
            items.map((i) => ({
              userId,
              weekday: i.weekday,
              startTime: i.startTime ?? null,
              endTime: i.endTime ?? null,
              maxMinutes: i.maxMinutes,
              kind: i.kind,
            })),
          );
        }
      });
    },

    /** Catálogo global (sem dados do usuário). */
    listEquipmentCatalog() {
      return db.select().from(equipment).orderBy(equipment.namePt);
    },

    listEquipmentAccess(userId: string) {
      return db
        .select({
          equipmentCode: equipmentAccess.equipmentCode,
          location: equipmentAccess.location,
        })
        .from(equipmentAccess)
        .where(eq(equipmentAccess.userId, userId));
    },

    async replaceEquipmentAccess(
      userId: string,
      items: readonly { equipmentCode: string; location: 'gym' | 'home' | 'other' }[],
    ) {
      await db.transaction(async (tx) => {
        await tx.delete(equipmentAccess).where(eq(equipmentAccess.userId, userId));
        if (items.length > 0)
          await tx.insert(equipmentAccess).values(items.map((i) => ({ userId, ...i })));
      });
    },

    listLimitations(userId: string) {
      return db
        .select()
        .from(limitations)
        .where(eq(limitations.userId, userId))
        .orderBy(desc(limitations.createdAt));
    },

    async createLimitation(userId: string, input: LimitationInput) {
      const [row] = await db
        .insert(limitations)
        .values({
          userId,
          ...input,
          startedAt: input.startedAt ?? null,
          resolvedAt: input.resolvedAt ?? null,
        })
        .returning();
      if (!row) throw new Error('insert limitations returned no row');
      return row;
    },

    async updateLimitation(userId: string, id: string, patch: LimitationPatch) {
      const [row] = await db
        .update(limitations)
        .set(patch)
        .where(and(eq(limitations.id, id), eq(limitations.userId, userId)))
        .returning();
      return row;
    },

    async deleteLimitation(userId: string, id: string): Promise<boolean> {
      const rows = await db
        .delete(limitations)
        .where(and(eq(limitations.id, id), eq(limitations.userId, userId)))
        .returning({ id: limitations.id });
      return rows.length > 0;
    },

    listSports(userId: string) {
      return db.select().from(sports).where(eq(sports.userId, userId)).orderBy(sports.createdAt);
    },

    async replaceSports(userId: string, items: readonly SportItem[]) {
      await db.transaction(async (tx) => {
        await tx.delete(sports).where(eq(sports.userId, userId));
        if (items.length > 0) {
          await tx
            .insert(sports)
            .values(items.map((i) => ({ userId, ...i, weekdayHint: i.weekdayHint ?? null })));
        }
      });
    },

    listGoals(userId: string) {
      return db
        .select()
        .from(goals)
        .where(eq(goals.userId, userId))
        .orderBy(desc(goals.effectiveFrom), desc(goals.createdAt));
    },

    async insertGoal(userId: string, input: GoalInput, effectiveFrom: string) {
      const [row] = await db
        .insert(goals)
        .values({
          userId,
          primaryGoal: input.primaryGoal,
          targetWeightKg: input.targetWeightKg ?? null,
          targetBodyFatPct: input.targetBodyFatPct ?? null,
          targetRatePctPerWeek: input.targetRatePctPerWeek ?? null,
          proteinGPerKg: input.proteinGPerKg ?? null,
          trainingFocus: input.trainingFocus ?? null,
          effectiveFrom,
        })
        .returning();
      if (!row) throw new Error('insert goals returned no row');
      return row;
    },

    /** Objetivo vigente na data: o mais recente com `effective_from ≤ date`. */
    async currentGoal(userId: string, date: string) {
      const [row] = await db
        .select()
        .from(goals)
        .where(and(eq(goals.userId, userId), lte(goals.effectiveFrom, date)))
        .orderBy(desc(goals.effectiveFrom), desc(goals.createdAt))
        .limit(1);
      return row;
    },
  };
}

export type ProfileRepository = ReturnType<typeof createProfileRepository>;
