import type { z } from 'zod';

import type { GoalRow, LimitationRow, ProfileRow } from '@atlas/db';
import type {
  AvailabilityItem,
  Goal,
  GoalInput,
  Limitation,
  Profile,
  ProfileInput,
  SportItem,
  limitationInputSchema,
  limitationPatchSchema,
} from '@atlas/schemas';

import { notFound, validationError } from '../../lib/errors';

import type { ProfileRepository } from './repository';

export function toProfileDto(row: ProfileRow): Profile {
  return {
    sex: row.sex,
    birthDate: row.birthDate,
    heightCm: row.heightCm,
    trainingExperience: row.trainingExperience,
    trainingAgeYears: row.trainingAgeYears,
    conditioningLevel: row.conditioningLevel,
    activityLifestyle: row.activityLifestyle,
    aestheticPriorities: row.aestheticPriorities,
    performancePriorities: row.performancePriorities,
    notes: row.notes,
    clinicalCondition: row.clinicalCondition,
  };
}

export function toGoalDto(row: GoalRow): Goal {
  return {
    id: row.id,
    primaryGoal: row.primaryGoal,
    targetWeightKg: row.targetWeightKg,
    targetBodyFatPct: row.targetBodyFatPct,
    targetRatePctPerWeek: row.targetRatePctPerWeek,
    proteinGPerKg: row.proteinGPerKg,
    trainingFocus: row.trainingFocus,
    effectiveFrom: row.effectiveFrom,
    createdAt: row.createdAt.toISOString(),
  };
}

const toLimitationDto = (row: LimitationRow): Limitation => ({
  id: row.id,
  bodyRegion: row.bodyRegion,
  description: row.description,
  severity: row.severity,
  contraindicatedPatterns: row.contraindicatedPatterns,
  active: row.active,
  startedAt: row.startedAt,
  resolvedAt: row.resolvedAt,
});

/** HH:MM:SS do Postgres → HH:MM. */
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

export interface ProfileServiceDeps {
  repo: ProfileRepository;
  hasWeighIn: (userId: string) => Promise<boolean>;
}

export function createProfileService({ repo, hasWeighIn }: ProfileServiceDeps) {
  return {
    async getProfile(userId: string) {
      const row = await repo.getProfile(userId);
      return row ? toProfileDto(row) : null;
    },

    /** ADR-020: perfil + objetivo + pesagem. */
    async onboardingComplete(userId: string): Promise<boolean> {
      const [profile, goalsList, weighed] = await Promise.all([
        repo.getProfile(userId),
        repo.listGoals(userId),
        hasWeighIn(userId),
      ]);
      return !!profile && goalsList.length > 0 && weighed;
    },

    async putProfile(userId: string, input: ProfileInput) {
      return toProfileDto(await repo.upsertProfile(userId, input));
    },

    async listAvailability(userId: string) {
      const rows = await repo.listAvailability(userId);
      return rows.map((r) => ({
        id: r.id,
        weekday: r.weekday,
        startTime: hhmm(r.startTime),
        endTime: hhmm(r.endTime),
        maxMinutes: r.maxMinutes,
        kind: r.kind,
      }));
    },

    async putAvailability(userId: string, items: AvailabilityItem[]) {
      const errors = items.flatMap((i, idx) =>
        i.startTime && i.endTime && i.startTime >= i.endTime
          ? [{ field: `items.${idx}.endTime`, message: 'O fim deve ser depois do início' }]
          : [],
      );
      if (errors.length > 0) throw validationError(errors);
      await repo.replaceAvailability(userId, items);
    },

    async getEquipment(userId: string) {
      const [catalog, items] = await Promise.all([
        repo.listEquipmentCatalog(),
        repo.listEquipmentAccess(userId),
      ]);
      return { catalog, items };
    },

    async putEquipment(
      userId: string,
      items: { equipmentCode: string; location: 'gym' | 'home' | 'other' }[],
    ) {
      const known = new Set((await repo.listEquipmentCatalog()).map((e) => e.code));
      const errors = items.flatMap((i, idx) =>
        known.has(i.equipmentCode)
          ? []
          : [{ field: `items.${idx}.equipmentCode`, message: 'Equipamento desconhecido' }],
      );
      if (errors.length > 0) throw validationError(errors);
      const unique = [
        ...new Map(items.map((i) => [`${i.equipmentCode}:${i.location}`, i])).values(),
      ];
      await repo.replaceEquipmentAccess(userId, unique);
    },

    async listLimitations(userId: string) {
      return (await repo.listLimitations(userId)).map(toLimitationDto);
    },

    async createLimitation(userId: string, input: z.output<typeof limitationInputSchema>) {
      return toLimitationDto(await repo.createLimitation(userId, input));
    },

    async updateLimitation(
      userId: string,
      id: string,
      patch: z.output<typeof limitationPatchSchema>,
    ) {
      const row = await repo.updateLimitation(userId, id, patch);
      if (!row) throw notFound('Limitação');
      return toLimitationDto(row);
    },

    async deleteLimitation(userId: string, id: string) {
      if (!(await repo.deleteLimitation(userId, id))) throw notFound('Limitação');
    },

    async listSports(userId: string) {
      return (await repo.listSports(userId)).map((r) => ({
        id: r.id,
        sportCode: r.sportCode,
        weeklyFrequency: r.weeklyFrequency,
        typicalDurationMin: r.typicalDurationMin,
        typicalIntensity: r.typicalIntensity,
        weekdayHint: r.weekdayHint,
      }));
    },

    putSports(userId: string, items: SportItem[]) {
      return repo.replaceSports(userId, items);
    },

    async listGoals(userId: string) {
      return (await repo.listGoals(userId)).map(toGoalDto);
    },

    async createGoal(userId: string, input: GoalInput, today: string) {
      return toGoalDto(await repo.insertGoal(userId, input, today));
    },

    async currentGoal(userId: string, date: string) {
      const row = await repo.currentGoal(userId, date);
      return row ? toGoalDto(row) : null;
    },

    /** Sessões de musculação planejadas (ADR-016). */
    async gymSessionMinutes(userId: string) {
      return (await repo.listAvailability(userId))
        .filter((a) => a.kind === 'gym')
        .map((a) => a.maxMinutes);
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
