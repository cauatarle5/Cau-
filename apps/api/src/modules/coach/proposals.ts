import type { FoodParser } from '@atlas/ai';
import type { AiActionProposalRow } from '@atlas/db';
import {
  goalInputSchema,
  mealCreateSchema,
  type MealSlot,
  type ProgramDto,
  type ProposalDto,
} from '@atlas/schemas';

import { AppError, notFound, validationError } from '../../lib/errors';
import type { Services } from '../../services';

import type { CoachRepository } from './repository';

type Ctx = { userId: string; timezone: string; today: string };

const DAY_MS = 86_400_000;

const nf = (v: number, d = 0) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(v);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'café da manhã',
  morning_snack: 'lanche da manhã',
  lunch: 'almoço',
  afternoon_snack: 'lanche da tarde',
  pre_workout: 'pré-treino',
  post_workout: 'pós-treino',
  dinner: 'jantar',
  supper: 'ceia',
  other: 'outra refeição',
};
const GOAL_LABELS = {
  fat_loss: 'perda de gordura',
  maintenance: 'manutenção',
  muscle_gain: 'ganho de massa',
  recomposition: 'recomposição',
  performance: 'performance',
} as const;
const MODE_LABELS = {
  normal: 'plano normal',
  reduced: 'volume reduzido',
  light: 'sessão leve',
  rest: 'descanso',
} as const;

interface Payload {
  details: string[];
  link: string | null;
  [k: string]: unknown;
}

export function toProposalDto(r: AiActionProposalRow): ProposalDto {
  const p = r.payload as Payload;
  return {
    id: r.id,
    actionType: r.actionType,
    summary: r.summary,
    status: r.status,
    details: p.details,
    conversationId: r.conversationId,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    resolvedAt: r.status === 'pending' ? null : (r.resolvedAt?.toISOString() ?? null),
    link: p.link,
  };
}

/** Propostas de escrita do Coach (P10.2, ADR-056): criar com prévia; aplicar reusa os serviços. */
export function createProposalsService(deps: {
  repo: CoachRepository;
  svc: Services;
  parser: FoodParser;
}) {
  const { repo, svc, parser } = deps;

  async function save(
    ctx: Ctx,
    conversationId: string | null,
    actionType: AiActionProposalRow['actionType'],
    summary: string,
    payload: Payload,
  ) {
    const row = await repo.createProposal(ctx.userId, {
      conversationId,
      actionType,
      summary,
      payload,
      expiresAt: new Date(Date.now() + DAY_MS),
    });
    return { id: row.id, summary, details: payload.details };
  }

  async function activeProgram(ctx: Ctx): Promise<ProgramDto> {
    const programs = await svc.training.listPrograms(ctx.userId);
    const active = programs.find((p) => p.status === 'active');
    if (!active) throw new Error('Não há programa ativo para trocar exercícios.');
    return active;
  }

  /** Templates do programa com a troca aplicada, no formato de entrada. */
  function swappedTemplates(program: ProgramDto, fromId: string, toId: string) {
    return program.templates
      .slice()
      .sort((a, b) => a.dayOrder - b.dayOrder)
      .map((t) => ({
        name: t.name,
        focusMuscles: t.focusMuscles as never[],
        estimatedMinutes: t.estimatedMinutes,
        exercises: t.exercises.map((e) => ({
          exerciseId: e.exerciseId === fromId ? toId : e.exerciseId,
          sets: e.sets,
          repMin: e.repMin,
          repMax: e.repMax,
          targetRir: e.targetRir,
          restSeconds: e.restSeconds,
          supersetGroup: e.supersetGroup,
          notes: e.notes,
        })),
      }));
  }

  return {
    async mealProposal(
      ctx: Ctx,
      conversationId: string,
      input: { text: string; slot: MealSlot; date: string; status: 'logged' | 'planned' },
    ) {
      const parsed = await parser.parse(input.text);
      const matched = await svc.foods.matchItems(ctx.userId, parsed.items);
      const missing = matched.items.filter((i) => !i.match || i.grams === null);
      if (matched.items.length === 0 || missing.length > 0) {
        throw new Error(
          `Não consegui identificar: ${missing.map((i) => i.raw).join(', ') || input.text}. Peça para o usuário detalhar (alimento e quantidade) ou registrar pela tela.`,
        );
      }
      const verb = input.status === 'logged' ? 'Registrar' : 'Planejar';
      const totals = matched.totals;
      return save(
        ctx,
        conversationId,
        input.status === 'logged' ? 'log_meal' : 'plan_meal',
        `${verb} ${SLOT_LABELS[input.slot]} de ${ddmm(input.date)}: ${nf(totals.kcal ?? 0)} kcal, ${nf(totals.proteinG ?? 0)} g de proteína`,
        {
          meal: {
            date: input.date,
            slot: input.slot,
            status: input.status,
            sourceText: input.text,
            items: matched.items.map((i) => ({
              foodId: i.match?.id,
              quantity: i.quantity,
              unit: i.unit,
              query: i.foodQuery,
              suggestedFoodId: i.match?.id,
              parseConfidence: i.score,
            })),
          },
          details: matched.items.map(
            (i) =>
              `${i.match?.namePt ?? i.raw}: ${nf(i.grams ?? 0)} g (${nf(i.nutrients?.kcal ?? 0)} kcal)`,
          ),
          link: '/nutricao',
        },
      );
    },

    async adaptationProposal(
      ctx: Ctx,
      conversationId: string,
      input: { date: string; reason: string },
    ) {
      const planned = (await svc.agenda.listPlanned(ctx.userId, input.date, input.date)).find(
        (p) => p.status !== 'skipped' && p.sessionId === null,
      );
      if (!planned)
        throw new Error(`Não há treino agendado ainda não iniciado em ${ddmm(input.date)}.`);
      const a = await svc.agenda.adapted(ctx, planned.id);
      if (!a.changed)
        throw new Error(
          `Pelas regras, o treino de ${ddmm(input.date)} fica no plano normal (prontidão e contexto não pedem ajuste).`,
        );
      const changes = a.exercises
        .filter((e) => e.removed || e.sets !== e.originalSets || e.substitute)
        .map((e) =>
          e.removed
            ? `${e.name}: retirado`
            : `${e.name}: ${nf(e.originalSets)} → ${nf(e.sets)} séries`,
        );
      return save(
        ctx,
        conversationId,
        'adapt_workout',
        `Adaptar ${planned.templateName} de ${ddmm(input.date)}: ${MODE_LABELS[a.mode]}`,
        {
          plannedWorkoutId: planned.id,
          reason: input.reason,
          details: [...a.explanation, ...changes, 'O plano é recalculado pelas regras ao aplicar.'],
          link: '/hoje',
        },
      );
    },

    async swapProposal(ctx: Ctx, conversationId: string, input: { from: string; to: string }) {
      const program = await activeProgram(ctx);
      const inProgram = new Set(
        program.templates.flatMap((t) => t.exercises.map((e) => e.exerciseId)),
      );
      const fromCandidates = await svc.exercises.search(ctx.userId, { q: input.from, limit: 10 });
      const from = fromCandidates.find((e) => inProgram.has(e.id));
      if (!from) throw new Error(`"${input.from}" não está no programa ativo.`);
      const [to] = await svc.exercises.search(ctx.userId, { q: input.to, limit: 1 });
      if (!to) throw new Error(`Exercício "${input.to}" não encontrado.`);
      if (to.id === from.id) throw new Error('O exercício novo é o mesmo do programa.');
      const templates = swappedTemplates(program, from.id, to.id);
      const warnings = await svc.agenda.validateTemplates(ctx.userId, templates);
      const where = program.templates
        .filter((t) => t.exercises.some((e) => e.exerciseId === from.id))
        .map((t) => t.name);
      return save(ctx, conversationId, 'swap_exercise', `Trocar ${from.namePt} por ${to.namePt}`, {
        programId: program.id,
        fromId: from.id,
        toId: to.id,
        details: [`Em: ${where.join(', ')}`, ...warnings.map((w) => `Aviso: ${w.message}`)],
        link: '/treino',
      });
    },

    async goalProposal(
      ctx: Ctx,
      conversationId: string,
      input: { primaryGoal: keyof typeof GOAL_LABELS; targetRatePctPerWeek: number | null },
    ) {
      const goal = goalInputSchema.safeParse(input);
      if (!goal.success)
        throw new Error(
          goal.error.issues[0]?.message ?? 'Objetivo inválido para as travas do Atlas.',
        );
      const preview = await svc.nutrition.previewGoal(ctx.userId, ctx.today, input);
      if (!preview)
        throw new Error('As metas estão bloqueadas (perfil incompleto ou condição clínica).');
      return save(
        ctx,
        conversationId,
        'update_goal',
        `Mudar objetivo para ${GOAL_LABELS[input.primaryGoal]}: meta média de ${nf(preview.before.kcal)} → ${nf(preview.after.kcal)} kcal`,
        {
          goal: input,
          details: [
            `Proteína: ${nf(preview.before.proteinG)} → ${nf(preview.after.proteinG)} g`,
            `Carboidrato: ${nf(preview.before.carbsG)} → ${nf(preview.after.carbsG)} g`,
            ...(preview.locksApplied.length > 0
              ? ['Travas de segurança aplicadas ao novo valor.']
              : []),
          ],
          link: '/nutricao',
        },
      );
    },

    async list(userId: string, status?: AiActionProposalRow['status']) {
      await repo.expireProposals(userId, new Date());
      return { items: (await repo.listProposals(userId, status)).map(toProposalDto) };
    },

    async reject(userId: string, id: string) {
      await repo.expireProposals(userId, new Date());
      const row = await repo.resolveProposal(userId, id, 'rejected', null);
      if (row) return toProposalDto(row);
      const current = await repo.getProposal(userId, id);
      if (!current) throw notFound('Proposta');
      throw new AppError(
        409,
        'PROPOSAL_NOT_PENDING',
        'Proposta já resolvida',
        'Esta proposta não está mais pendente.',
      );
    },

    /** Aplica uma vez só (trava condicional); falha devolve a proposta a pendente. */
    async accept(ctx: Ctx, id: string) {
      const now = new Date();
      await repo.expireProposals(ctx.userId, now);
      const claimed = await repo.claimProposal(ctx.userId, id, now);
      if (!claimed) {
        const current = await repo.getProposal(ctx.userId, id);
        if (!current) throw notFound('Proposta');
        throw new AppError(
          409,
          'PROPOSAL_NOT_PENDING',
          'Proposta já resolvida',
          'Esta proposta não está mais pendente.',
        );
      }
      const p = claimed.payload as Payload;
      let result: unknown;
      try {
        result = await apply(ctx, claimed.actionType, p);
      } catch (err) {
        // Nada foi aplicado: a proposta volta a pendente.
        await repo.releaseProposal(ctx.userId, id);
        throw err;
      }
      // Já aplicado: não libera a trava (evita aplicar de novo); só conclui.
      const row = await repo.resolveProposal(ctx.userId, id, 'accepted', result);
      if (!row) throw new Error('proposal changed while applying');
      return toProposalDto(row);
    },
  };

  async function apply(ctx: Ctx, actionType: AiActionProposalRow['actionType'], p: Payload) {
    switch (actionType) {
      case 'log_meal':
      case 'plan_meal': {
        const meal = mealCreateSchema.parse(p.meal);
        return { mealId: (await svc.meals.create(ctx.userId, meal)).id };
      }
      case 'adapt_workout': {
        const dto = await svc.agenda.applyAdaptation(ctx, String(p.plannedWorkoutId));
        return { plannedWorkoutId: dto.plannedWorkout.id, mode: dto.mode };
      }
      case 'swap_exercise': {
        const program = await activeProgram(ctx);
        if (program.id !== p.programId)
          throw validationError([{ field: 'programId', message: 'O programa ativo mudou' }]);
        const updated = await svc.training.updateProgram(ctx, program.id, {
          templates: swappedTemplates(program, String(p.fromId), String(p.toId)),
        });
        return { programId: updated.id, warnings: updated.warnings.length };
      }
      case 'update_goal': {
        const goal = goalInputSchema.parse(p.goal);
        return { goalId: (await svc.profile.createGoal(ctx.userId, goal, ctx.today)).id };
      }
    }
  }
}

export type ProposalsService = ReturnType<typeof createProposalsService>;
