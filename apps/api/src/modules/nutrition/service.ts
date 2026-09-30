import { ageOn, computeTargets, dateRange, daysBetween } from '@atlas/core';
import type { TargetsResponse } from '@atlas/schemas';

import type { BodyService } from '../body/service';
import type { ProfileService } from '../profile/service';

export interface NutritionServiceDeps {
  profile: ProfileService;
  body: BodyService;
}

/** Metas por fórmula, calculadas sob demanda (ADR-015). */
export function createNutritionService({ profile, body }: NutritionServiceDeps) {
  return {
    async targets(
      userId: string,
      from: string,
      to: string,
      today: string,
    ): Promise<TargetsResponse> {
      const [prof, goal, trend, sports, gymSessionMinutes, bodyFat] = await Promise.all([
        profile.getProfile(userId),
        profile.currentGoal(userId, today),
        body.latestTrend(userId),
        profile.listSports(userId),
        profile.gymSessionMinutes(userId),
        body.latestBodyFat(userId),
      ]);

      const empty = { targets: null, breakdown: null, days: [] };
      if (!prof || !goal || !trend) return { blocked: 'ONBOARDING_INCOMPLETE', ...empty };
      if (prof.clinicalCondition) return { blocked: 'CLINICAL_CONDITION', ...empty };

      const ageYears = ageOn(prof.birthDate, today);
      const fat =
        bodyFat?.pct !== null && bodyFat?.pct !== undefined && bodyFat.method
          ? { pct: bodyFat.pct, method: bodyFat.method, daysAgo: daysBetween(bodyFat.date, today) }
          : null;

      const { targets, breakdown } = computeTargets({
        sex: prof.sex,
        ageYears,
        heightCm: prof.heightCm,
        weightKg: trend.trendKg,
        bodyFat: fat,
        lifestyle: prof.activityLifestyle,
        experience: prof.trainingExperience,
        goal: goal.primaryGoal,
        targetRatePctPerWeek: goal.targetRatePctPerWeek,
        proteinGPerKg: goal.proteinGPerKg,
        gymSessionMinutes,
        sports: sports.map((s) => ({
          sportCode: s.sportCode,
          weeklyFrequency: s.weeklyFrequency,
          durationMin: s.typicalDurationMin,
          intensity: s.typicalIntensity,
        })),
      });

      return {
        blocked: null,
        targets,
        breakdown: {
          ...breakdown,
          ageYears,
          weightDate: trend.date,
          bodyFatPct: fat?.pct ?? null,
        },
        days: dateRange(from, to).map((date) => ({
          date,
          dayType: null,
          method: 'formula' as const,
          ...targets,
        })),
      };
    },
  };
}

export type NutritionService = ReturnType<typeof createNutritionService>;
