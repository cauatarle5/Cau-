import { COACH_TOOLS, type CoachToolInput, type CoachToolName } from '@atlas/ai';
import { addDays, daysBetween } from '@atlas/core';

import type { Services } from '../../services';

import type { ProposalsService } from './proposals';

type Ctx = { userId: string; timezone: string; today: string };

/** Rótulos do evento `tool` (o que a tela mostra enquanto consulta). */
export const TOOL_LABELS: Record<CoachToolName, string> = {
  get_profile_summary: 'Lendo seu perfil',
  get_daily_context: 'Consultando o dia',
  get_period_summary: 'Resumindo o período',
  get_exercise_progress: 'Olhando a evolução do exercício',
  get_muscle_volume: 'Calculando o volume por músculo',
  get_nutrition_history: 'Consultando a alimentação',
  get_body_trend: 'Consultando o peso',
  get_recovery_history: 'Consultando a recuperação',
  get_insights: 'Lendo seus insights',
  get_today_plan: 'Vendo o plano de hoje',
  search_foods: 'Buscando alimentos',
  suggest_meal: 'Montando sugestões de refeição',
  compare_periods: 'Comparando períodos',
  propose_meal_log: 'Preparando o registro',
  propose_meal_plan: 'Preparando o planejamento',
  propose_workout_adaptation: 'Preparando a adaptação do treino',
  propose_exercise_swap: 'Preparando a troca de exercício',
  propose_goal_update: 'Preparando o novo objetivo',
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function range(start: string, end: string, today: string) {
  if (!ISO.test(start) || !ISO.test(end))
    throw new Error('Datas devem estar no formato AAAA-MM-DD.');
  if (start > end) throw new Error('A data inicial deve ser anterior à final.');
  if (daysBetween(start, end) > 400) throw new Error('Período máximo de 400 dias.');
  return { start, end: end > today ? today : end };
}

/**
 * Ferramentas do Coach para o usuário da sessão (ADR-054): o `userId` vem do contexto, nunca do
 * modelo. Retornos enxutos e com os números já calculados pelo core.
 */
export function createCoachToolExecutor(deps: {
  svc: Services;
  proposals: ProposalsService;
  ctx: Ctx;
  conversationId: string;
  onProposal: (proposalId: string) => void;
}) {
  const { svc, proposals, ctx, conversationId, onProposal } = deps;
  const { userId, today } = ctx;

  async function summary(start: string, end: string) {
    const r = range(start, end, today);
    return { r, s: await svc.analytics.summary(userId, r.start, r.end, today) };
  }

  const handlers: { [N in CoachToolName]: (input: CoachToolInput<N>) => Promise<unknown> } = {
    async get_profile_summary() {
      const [profile, goal, limitations, training, targets] = await Promise.all([
        svc.profile.getProfile(userId),
        svc.profile.currentGoal(userId, today),
        svc.profile.listLimitations(userId),
        svc.profile.trainingContext(userId),
        svc.nutrition.targets(userId, today, today, today),
      ]);
      return {
        profile: profile && {
          sex: profile.sex,
          birthDate: profile.birthDate,
          heightCm: profile.heightCm,
          trainingExperience: profile.trainingExperience,
          activityLifestyle: profile.activityLifestyle,
        },
        goal,
        limitations: limitations.map((l) => ({ bodyRegion: l.bodyRegion, severity: l.severity })),
        priorities: [...training.priorities],
        averageTargets: targets.targets,
        targetsBlocked: targets.blocked,
      };
    },

    async get_daily_context({ date }) {
      if (!ISO.test(date)) throw new Error('Data deve estar no formato AAAA-MM-DD.');
      const dc = await svc.dailyContext.get(ctx, date);
      return { ...dc, topInsight: undefined };
    },

    async get_period_summary({ start, end }) {
      const { r, s } = await summary(start, end);
      return {
        period: r,
        summary: s.summary,
        strengthRanking: s.strength.map(({ points: _p, ...e }) => e),
        volume: s.volume,
        goal: s.goal,
      };
    },

    async get_exercise_progress({ exercise, start, end }) {
      const r = range(start, end, today);
      const [found] = await svc.exercises.search(userId, { q: exercise, limit: 1 });
      if (!found) throw new Error(`Exercício "${exercise}" não encontrado.`);
      const [progress, period] = await Promise.all([
        svc.training.progress(ctx, found.id, { from: r.start, to: r.end }),
        svc.analytics.summary(userId, r.start, r.end, today),
      ]);
      const trend = period.strength.find((e) => e.exerciseId === found.id);
      return {
        period: r,
        exercise: found.namePt,
        sessions: progress.points.map((p) => ({
          date: p.date,
          bestE1rm: p.bestE1rm === null ? null : Math.round(p.bestE1rm * 10) / 10,
          topLoadKg: p.topLoadKg,
          tonnage: Math.round(p.tonnage),
        })),
        records: progress.records,
        changePct: trend?.changePct ?? null,
        stagnant: trend?.stagnant ?? null,
      };
    },

    async get_muscle_volume({ start, end }) {
      const { r, s } = await summary(start, end);
      return { period: r, muscles: s.volume, note: 'séries duras por semana (média do período)' };
    },

    async get_nutrition_history({ start, end }) {
      const { r, s } = await summary(start, end);
      const energy = await svc.energy.list(userId, today);
      return {
        period: r,
        nutrition: s.summary.nutrition,
        daily: s.days.map((d) => ({
          date: d.date,
          completeDay: d.completeDay,
          kcal: d.kcal,
          proteinG: d.proteinG,
          targetKcal: d.targetKcal,
          targetProteinG: d.targetProteinG,
        })),
        energyEstimateInUse: energy.current,
      };
    },

    async get_body_trend({ start, end }) {
      const { r, s } = await summary(start, end);
      return {
        period: r,
        body: s.summary.body,
        weighIns: s.days.flatMap((d) =>
          d.weightKg === null ? [] : [{ date: d.date, weightKg: d.weightKg, trendKg: d.trendKg }],
        ),
        goal: s.goal,
      };
    },

    async get_recovery_history({ start, end }) {
      const { r, s } = await summary(start, end);
      return {
        period: r,
        recovery: s.summary.recovery,
        daily: s.days.map((d) => ({
          date: d.date,
          sleepHours: d.sleepHours,
          readiness: d.readiness,
          acute7d: d.acute7d,
          chronic28d: d.chronic28d,
          acwr: d.acwr,
        })),
      };
    },

    async get_insights({ status }) {
      const list = await svc.insights.list(userId, status ?? undefined);
      return {
        items: list.items.map((i) => ({
          type: i.type,
          severity: i.severity,
          title: i.title,
          body: i.body,
          data: i.data,
          period: { start: i.periodStart, end: i.periodEnd },
        })),
      };
    },

    async get_today_plan() {
      const [dc, meals] = await Promise.all([
        svc.dailyContext.get(ctx, today),
        svc.meals.list(userId, today),
      ]);
      return {
        date: today,
        workout: dc.training,
        plannedMeals: meals
          .filter((m) => m.status === 'planned')
          .map((m) => ({
            slot: m.slot,
            items: m.items.map((i) => `${i.foodName} (${i.grams} g)`),
            totals: m.totals,
          })),
        nutrition: dc.nutrition,
      };
    },

    async search_foods({ query }) {
      const items = await svc.foods.search(userId, query, 8);
      return {
        items: items.map((f) => ({
          id: f.id,
          name: f.namePt,
          per100g: {
            kcal: f.per100.kcal,
            proteinG: f.per100.proteinG,
            carbsG: f.per100.carbsG,
            fatG: f.per100.fatG,
          },
        })),
      };
    },

    async suggest_meal({ slot }) {
      const r = await svc.mealPlans.suggest(userId, { date: today }, today);
      return { slot, ...r };
    },

    async compare_periods({ a_start, a_end, b_start, b_end }) {
      const a = range(a_start, a_end, today);
      const b = range(b_start, b_end, today);
      const r = await svc.analytics.compare(
        userId,
        { aFrom: a.start, aTo: a.end, bFrom: b.start, bTo: b.end },
        today,
      );
      return { a, b, deltas: r.deltas };
    },

    async propose_meal_log({ text, slot }) {
      return created(
        await proposals.mealProposal(ctx, conversationId, {
          text,
          slot,
          date: today,
          status: 'logged',
        }),
      );
    },

    async propose_meal_plan({ text, slot, date }) {
      if (!ISO.test(date) || date < today || date > addDays(today, 14))
        throw new Error('Planeje para hoje ou até 14 dias à frente (AAAA-MM-DD).');
      return created(
        await proposals.mealProposal(ctx, conversationId, { text, slot, date, status: 'planned' }),
      );
    },

    async propose_workout_adaptation({ date, reason }) {
      if (!ISO.test(date)) throw new Error('Data deve estar no formato AAAA-MM-DD.');
      return created(await proposals.adaptationProposal(ctx, conversationId, { date, reason }));
    },

    async propose_exercise_swap({ from_exercise, to_exercise }) {
      return created(
        await proposals.swapProposal(ctx, conversationId, { from: from_exercise, to: to_exercise }),
      );
    },

    async propose_goal_update({ primary_goal, target_rate_pct_per_week }) {
      return created(
        await proposals.goalProposal(ctx, conversationId, {
          primaryGoal: primary_goal,
          targetRatePctPerWeek: target_rate_pct_per_week,
        }),
      );
    },
  };

  function created(p: { id: string; summary: string; details: string[] }) {
    onProposal(p.id);
    return {
      proposalCreated: true,
      summary: p.summary,
      details: p.details,
      note: 'O usuário vê um cartão com Aplicar/Descartar; nada foi gravado ainda.',
    };
  }

  return async (name: CoachToolName, input: unknown): Promise<unknown> => {
    const parsed = COACH_TOOLS[name].input.safeParse(input);
    if (!parsed.success) throw new Error('Parâmetros inválidos para a ferramenta.');
    const handler = handlers[name] as (i: unknown) => Promise<unknown>;
    return handler(parsed.data);
  };
}
