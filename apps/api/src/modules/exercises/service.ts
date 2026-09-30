import type { z } from 'zod';

import {
  normalizeForSearch,
  rankAlternatives,
  type ExerciseLite,
  type MuscleCode,
  type Preference,
} from '@atlas/core';
import type {
  ExerciseDto,
  customExerciseInputSchema,
  exercisePreferencesPutSchema,
  exerciseSearchQuerySchema,
} from '@atlas/schemas';

import { notFound, validationError } from '../../lib/errors';
import type { ProfileService } from '../profile/service';

import type { ExerciseBundle, ExercisesRepository } from './repository';

export function toExerciseDto(b: ExerciseBundle): ExerciseDto {
  const e = b.exercise;
  return {
    id: e.id,
    namePt: e.namePt,
    aliases: e.aliases,
    movementPattern: e.movementPattern,
    mechanics: e.mechanics,
    laterality: e.laterality,
    equipmentCodes: e.equipmentCodes,
    loadType: e.loadType,
    defaultIncrementKg: e.defaultIncrementKg,
    contraindicationTags: e.contraindicationTags,
    isCustom: e.userId !== null,
    primaryMuscles: b.muscles
      .filter((m) => m.role === 'primary')
      .map((m) => m.muscleCode as MuscleCode),
    secondaryMuscles: b.muscles
      .filter((m) => m.role === 'secondary')
      .map((m) => m.muscleCode as MuscleCode),
    preference: b.preference,
  };
}

/** Padrão de movimento também conta como contraindicação (limitações usam os dois). */
function toLite(b: ExerciseBundle): ExerciseLite {
  return {
    id: b.exercise.id,
    movementPattern: b.exercise.movementPattern,
    mechanics: b.exercise.mechanics,
    equipmentCodes: b.exercise.equipmentCodes,
    contraindicationTags: [...b.exercise.contraindicationTags, b.exercise.movementPattern],
    primaryMuscles: b.muscles
      .filter((m) => m.role === 'primary')
      .map((m) => m.muscleCode as MuscleCode),
  };
}

export function createExercisesService(deps: {
  repo: ExercisesRepository;
  profile: ProfileService;
}) {
  const { repo, profile } = deps;

  async function getBundle(userId: string, id: string): Promise<ExerciseBundle> {
    const [b] = await repo.byIds(userId, [id]);
    if (!b) throw notFound('Exercício');
    return b;
  }

  return {
    async search(userId: string, query: z.output<typeof exerciseSearchQuerySchema>) {
      const q = query.q ? normalizeForSearch(query.q) : undefined;
      const rows = await repo.search(userId, { ...query, q: q || undefined });
      return rows.map(toExerciseDto);
    },

    async get(userId: string, id: string) {
      return toExerciseDto(await getBundle(userId, id));
    },

    getBundle,

    /** Exercícios visíveis ao usuário, por id (para outros módulos). */
    bundles(userId: string, ids: readonly string[]) {
      return repo.byIds(userId, ids);
    },

    async createCustom(userId: string, input: z.output<typeof customExerciseInputSchema>) {
      const id = await repo.createCustom(
        userId,
        {
          namePt: input.namePt,
          nameNormalized: normalizeForSearch(input.namePt),
          movementPattern: input.movementPattern,
          mechanics: input.mechanics,
          laterality: input.laterality,
          equipmentCodes: input.equipmentCodes,
          loadType: input.loadType,
          defaultIncrementKg: input.defaultIncrementKg,
        },
        [
          ...input.primaryMuscles.map((m) => ({
            muscleCode: m,
            role: 'primary' as const,
            weight: 1,
          })),
          ...input.secondaryMuscles.map((m) => ({
            muscleCode: m,
            role: 'secondary' as const,
            weight: 0.5,
          })),
        ],
      );
      return toExerciseDto(await getBundle(userId, id));
    },

    /** Alternativas ranqueadas pelo core (P8.4), respeitando equipamento, limitações e preferências. */
    async alternatives(userId: string, id: string, limit = 10) {
      const target = await getBundle(userId, id);
      const [candidates, ctx] = await Promise.all([
        repo.alternativeCandidates(userId, target),
        profile.trainingContext(userId),
      ]);
      const byId = new Map(candidates.map((c) => [c.exercise.id, c]));
      const preferences = new Map<string, Preference>(
        candidates.flatMap((c) => (c.preference ? [[c.exercise.id, c.preference] as const] : [])),
      );
      const ranked = rankAlternatives(toLite(target), candidates.map(toLite), {
        availableEquipment: ctx.equipment,
        preferences,
        contraindicated: ctx.contraindicated,
      });
      return ranked.slice(0, limit).flatMap((r) => {
        const b = byId.get(r.exercise.id);
        return b ? [toExerciseDto(b)] : [];
      });
    },

    async listPreferences(userId: string) {
      return { items: await repo.listPreferences(userId) };
    },

    async putPreferences(userId: string, input: z.output<typeof exercisePreferencesPutSchema>) {
      const items = [...new Map(input.items.map((i) => [i.exerciseId, i])).values()];
      const found = new Set(
        (
          await repo.byIds(
            userId,
            items.map((i) => i.exerciseId),
          )
        ).map((b) => b.exercise.id),
      );
      const errors = items.flatMap((i, idx) =>
        found.has(i.exerciseId)
          ? []
          : [{ field: `items.${String(idx)}.exerciseId`, message: 'Exercício não encontrado' }],
      );
      if (errors.length > 0) throw validationError(errors);
      await repo.replacePreferences(userId, items);
      return { items: await repo.listPreferences(userId) };
    },

    async muscleNames() {
      return new Map((await repo.listMuscles()).map((m) => [m.code, m.namePt]));
    },
  };
}

export type ExercisesService = ReturnType<typeof createExercisesService>;
