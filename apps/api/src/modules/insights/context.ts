import { addDays, contextFlags, daysBetween, isHardSet, tonnage } from '@atlas/core';
import type { DailyContextDto } from '@atlas/schemas';

import type { BodyService } from '../body/service';
import type { MealsService } from '../nutrition/meals';
import type { RecoveryService } from '../recovery/service';
import type { createAgendaService } from '../training/agenda';
import type { TrainingService } from '../training/service';

import type { InsightsService } from './service';

type AgendaService = ReturnType<typeof createAgendaService>;
type Ctx = { userId: string; timezone: string; today: string };

/** Fotografia do dia (P9): tipo, prontidão, treino, atividades, carga, nutrição, corpo e sinais. */
export function createDailyContextService(deps: {
  meals: MealsService;
  recovery: () => RecoveryService;
  agenda: () => AgendaService;
  training: () => TrainingService;
  body: BodyService;
  insights: InsightsService;
}) {
  const { meals, recovery, agenda, training, body, insights } = deps;

  return {
    async get(ctx: Ctx, date: string): Promise<DailyContextDto> {
      const { userId } = ctx;
      const rec = recovery();
      const [summary, checkin, activities, yesterday, load, planned, sessions, trend, top] =
        await Promise.all([
          meals.summary(userId, date, ctx.today),
          rec.getCheckin(userId, date),
          rec.listActivities(userId, date, date),
          rec.listActivities(userId, addDays(date, -1), addDays(date, -1)),
          rec.loadRange(userId, date, date),
          agenda().listPlanned(userId, date, date),
          training().listSessions(ctx, { from: date, to: date }),
          body.trend(userId, addDays(date, -365), date),
          insights.top(userId),
        ]);

      const plan = planned.find((p) => p.status !== 'skipped') ?? null;
      const doneSummary = sessions[0] ?? null;
      let adapted: DailyContextDto['training']['adapted'] = null;
      // Adaptação só para treino ainda não feito, de hoje em diante.
      if (plan && !plan.sessionId && !doneSummary && date >= ctx.today && plan.workoutTemplateId) {
        const a = await agenda().adapted(ctx, plan.id);
        adapted = { mode: a.mode, changed: a.changed, explanation: a.explanation };
      }
      let done: DailyContextDto['training']['done'] = null;
      if (doneSummary) {
        const full = await training().getSession(userId, doneSummary.id);
        const sets = full.exercises.flatMap((e) => e.sets);
        done = {
          id: doneSummary.id,
          name: doneSummary.name,
          durationMin: doneSummary.durationMin,
          sessionRpe: doneSummary.sessionRpe,
          tonnage: tonnage(sets),
          hardSets: sets.filter(isHardSet).length,
        };
      }

      const l = load[0];
      const t = summary.targets;
      const latest = trend.latest;
      return {
        date,
        dayType: t?.dayType ?? null,
        readiness: checkin.readiness,
        training: { planned: plan, adapted, done },
        activities,
        load: {
          dayAU: l?.dayAU ?? 0,
          acute7d: l?.acute7d ?? 0,
          chronic28d: l?.chronic28d ?? 0,
          acwr: l?.acwr ?? null,
        },
        nutrition: {
          targets: t
            ? {
                kcal: t.kcal,
                proteinG: t.proteinG,
                carbsG: t.carbsG,
                fatG: t.fatG,
                fiberG: t.fiberG,
                waterMl: t.waterMl,
              }
            : null,
          consumed: summary.consumed,
          planned: summary.planned,
          remaining: summary.remaining,
          loggedMeals: summary.loggedMeals,
          completeness: Math.min(1, summary.loggedMeals / 3),
        },
        body: {
          weightTrendKg: latest ? Math.round(latest.trendKg * 100) / 100 : null,
          lastWeighInDaysAgo: latest ? daysBetween(latest.date, date) : null,
        },
        flags: contextFlags({
          proteinProjectedG: summary.consumed.proteinG + summary.planned.proteinG,
          proteinTargetG: t?.proteinG ?? null,
          hasMeals: summary.consumed.kcal + summary.planned.kcal > 0,
          sportYesterday: yesterday.length > 0,
          sleepHours: checkin.checkin?.sleepHours ?? null,
          sleepQuality: checkin.checkin?.sleepQuality ?? null,
          acwr: l?.acwr ?? null,
        }),
        topInsight: top,
      };
    },
  };
}

export type DailyContextService = ReturnType<typeof createDailyContextService>;
