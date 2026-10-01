import {
  activityMet,
  addDays,
  ageOn,
  computeTargets,
  dateRange,
  daysBetween,
  distributeWeek,
  netExerciseKcal,
  planDayType,
  sportMet,
  type DayType,
  type SportCode,
  type TargetsResult,
  type WeekDayPlan,
} from '@atlas/core';
import type { NutritionTargetRow } from '@atlas/db';
import type { DayTargetsDto, TargetsResponse } from '@atlas/schemas';

import { validationError } from '../../lib/errors';
import type { BodyService } from '../body/service';
import type { ProfileService } from '../profile/service';

import type { NutritionRepository } from './repository';

/** O que aconteceu ou está agendado num dia (ADR-048). */
export interface RealDay {
  gym: boolean;
  hardGym: boolean;
  /** Minutos de academia; `null` = usar a disponibilidade do dia (ou 60). */
  gymMinutes: number | null;
  activities: { sportCode: SportCode; durationMin: number; intensityRpe: number }[];
}

export interface RealPlan {
  /** Semanas (segunda-feira) com treinos agendados: nelas a disponibilidade não conta. */
  agendaWeeks: Set<string>;
  days: Map<string, RealDay>;
}

export interface NutritionServiceDeps {
  profile: ProfileService;
  body: BodyService;
  repo: NutritionRepository;
  /** Agenda, sessões e atividades do intervalo (ADR-048); sem ela, só a disponibilidade. */
  realPlan?: (userId: string, from: string, to: string, today: string) => Promise<RealPlan>;
  /** GET adaptativo em uso (confiança média/alta, ADR-051). */
  adaptiveTdee?: (
    userId: string,
    today: string,
  ) => Promise<{ kcal: number; confidence: 'medium' | 'high' } | null>;
}

/** Segunda-feira da semana (seg–dom) de uma data. */
export function weekStart(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

function toDayDto(row: NutritionTargetRow): DayTargetsDto {
  return {
    date: row.date,
    dayType: row.dayType,
    dayTypeOverridden: row.dayTypeOverridden,
    method: row.method,
    kcal: row.kcal,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
    fiberG: row.fiberG,
    waterMl: row.waterMl,
  };
}

/**
 * Metas diárias por tipo de dia (P5.8, ADR-026): base por fórmula (P5.1–5.7), tipo de dia
 * pelo plano semanal, distribuição preservando a média; snapshot persistido e dias
 * passados nunca recalculados.
 */
export function createNutritionService({
  profile,
  body,
  repo,
  realPlan,
  adaptiveTdee,
}: NutritionServiceDeps) {
  async function base(userId: string, today: string, opts: { formulaOnly?: boolean } = {}) {
    const [prof, goal, trend, sports, availability, bodyFat, adaptive] = await Promise.all([
      profile.getProfile(userId),
      profile.currentGoal(userId, today),
      body.latestTrend(userId),
      profile.listSports(userId),
      profile.listAvailability(userId),
      body.latestBodyFat(userId),
      adaptiveTdee && !opts.formulaOnly ? adaptiveTdee(userId, today) : null,
    ]);
    if (!prof || !goal || !trend) return { blocked: 'ONBOARDING_INCOMPLETE' as const };
    if (prof.clinicalCondition) return { blocked: 'CLINICAL_CONDITION' as const };

    const ageYears = ageOn(prof.birthDate, today);
    const fat =
      bodyFat?.pct !== null && bodyFat?.pct !== undefined && bodyFat.method
        ? { pct: bodyFat.pct, method: bodyFat.method, daysAgo: daysBetween(bodyFat.date, today) }
        : null;
    const gym = availability.filter((a) => a.kind === 'gym');
    const result: TargetsResult = computeTargets({
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
      gymSessionMinutes: gym.map((a) => a.maxMinutes),
      sports: sports.map((s) => ({
        sportCode: s.sportCode,
        weeklyFrequency: s.weeklyFrequency,
        durationMin: s.typicalDurationMin,
        intensity: s.typicalIntensity,
      })),
      adaptiveTdee: adaptive,
    });

    const availabilityMinutes = (wd: number) =>
      gym.filter((a) => a.weekday === wd).reduce((acc, a) => acc + a.maxMinutes, 0);

    /**
     * Plano de uma semana: tipo do dia pelo plano real (ADR-048) quando houver agenda, sessão
     * ou atividade; senão, pela disponibilidade e pelos esportes fixos (ADR-026). Tipos
     * escolhidos pelo usuário prevalecem.
     */
    const weekPlan = (
      start: string,
      overrides: Map<string, DayType>,
      real: RealPlan | null,
    ): WeekDayPlan[] =>
      dateRange(start, addDays(start, 6)).map((date) => {
        const wd = weekday(date);
        const day = real?.days.get(date);
        const useAgenda = real?.agendaWeeks.has(start) ?? false;
        const available = availabilityMinutes(wd);
        const gymDay = (day?.gym ?? false) || (!useAgenda && available > 0);
        const gymMinutes = !gymDay
          ? 0
          : day?.gym
            ? (day.gymMinutes ?? (available > 0 ? available : 60))
            : available;
        // Atividade registrada substitui o esporte fixo do dia.
        const registered = day?.activities ?? [];
        const fixed = registered.length > 0 ? [] : sports.filter((s) => s.weekdayHint === wd);
        const sportMinutes =
          registered.reduce((acc, a) => acc + a.durationMin, 0) +
          fixed.reduce((acc, s) => acc + s.typicalDurationMin, 0);
        const sportKcal =
          registered.reduce(
            (acc, a) =>
              acc +
              netExerciseKcal(
                activityMet(a.sportCode, a.intensityRpe),
                trend.trendKg,
                a.durationMin,
              ),
            0,
          ) +
          fixed.reduce(
            (acc, s) =>
              acc +
              netExerciseKcal(
                sportMet(s.sportCode, s.typicalIntensity),
                trend.trendKg,
                s.typicalDurationMin,
              ),
            0,
          );
        return {
          date,
          dayType:
            overrides.get(date) ??
            planDayType({
              gym: gymDay,
              sport: registered.length + fixed.length > 0,
              hardGym: day?.hardGym ?? false,
            }),
          sportKcal,
          exerciseMinutes: gymMinutes + sportMinutes,
        };
      });

    return {
      blocked: null,
      result,
      goalId: goal.id,
      ageYears,
      weightDate: trend.date,
      bodyFatPct: fat?.pct ?? null,
      sex: prof.sex,
      weightKg: trend.trendKg,
      weekPlan,
    };
  }

  async function targets(
    userId: string,
    from: string,
    to: string,
    today: string,
  ): Promise<TargetsResponse> {
    const b = await base(userId, today);
    if (b.blocked) return { blocked: b.blocked, targets: null, breakdown: null, days: [] };

    const firstWeek = weekStart(from);
    const lastWeek = weekStart(to);
    const existing = await repo.snapshots(userId, firstWeek, addDays(lastWeek, 6));
    const byDate = new Map(existing.map((s) => [s.date, s]));
    const overrides = new Map(
      existing.filter((s) => s.dayTypeOverridden).map((s) => [s.date, s.dayType]),
    );
    const real = realPlan ? await realPlan(userId, firstWeek, addDays(lastWeek, 6), today) : null;

    const days: DayTargetsDto[] = [];
    for (let ws = firstWeek; ws <= lastWeek; ws = addDays(ws, 7)) {
      const plan = distributeWeek({
        base: b.result.targets,
        week: b.weekPlan(ws, overrides, real),
        weightKg: b.weightKg,
        bmrKcal: b.result.breakdown.bmr.kcal,
        sex: b.sex,
      });
      for (const day of plan) {
        if (day.date < from || day.date > to) continue;
        const snapshot = byDate.get(day.date);
        // Dias passados usam o snapshot; nunca são recalculados.
        if (day.date < today && snapshot) {
          days.push(toDayDto(snapshot));
          continue;
        }
        const row = {
          date: day.date,
          dayType: day.dayType,
          dayTypeOverridden: overrides.has(day.date),
          kcal: day.kcal,
          proteinG: day.proteinG,
          carbsG: day.carbsG,
          fatG: day.fatG,
          fiberG: day.fiberG,
          waterMl: day.waterMl,
          method: b.result.breakdown.adaptive ? ('adaptive' as const) : ('formula' as const),
          inputs: {
            baseTargets: b.result.targets,
            tdeeKcal: b.result.breakdown.tdee.kcal,
            weightKg: b.weightKg,
          },
          goalId: b.goalId,
        };
        // Passado sem snapshot: calcula para exibir, sem gravar histórico que não existiu.
        if (day.date >= today) await repo.upsertSnapshot(userId, row);
        days.push({ ...row });
      }
    }

    return {
      blocked: null,
      targets: b.result.targets,
      breakdown: {
        ...b.result.breakdown,
        ageYears: b.ageYears,
        weightDate: b.weightDate,
        bodyFatPct: b.bodyFatPct,
      },
      days,
    };
  }

  return {
    targets,

    /** GET por fórmula (base do GET adaptativo); `null` se as metas estão bloqueadas. */
    async formulaTdee(userId: string, today: string): Promise<number | null> {
      const b = await base(userId, today, { formulaOnly: true });
      return b.blocked ? null : b.result.breakdown.tdee.kcal;
    },

    /** Sobrescreve o tipo do dia (P5.8) ou volta ao automático (`null`) e recalcula. */
    async setDayType(userId: string, date: string, dayType: DayType | null, today: string) {
      if (date < today)
        throw validationError([{ field: 'date', message: 'Dias passados não são recalculados' }]);
      const current = await targets(userId, date, date, today);
      const day = current.days[0];
      if (!day) return current;
      await repo.upsertSnapshot(userId, {
        ...day,
        dayType: dayType ?? day.dayType,
        dayTypeOverridden: dayType !== null,
        inputs: { overriddenAt: new Date().toISOString() },
      });
      return targets(userId, date, date, today);
    },
  };
}

export type NutritionService = ReturnType<typeof createNutritionService>;
