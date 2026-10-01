import type { z } from 'zod';

import {
  adaptWorkout,
  addDays,
  DEFAULT_MESOCYCLE,
  DEFAULT_MESOCYCLE_COUNT,
  estimateMinutes,
  generateProgram,
  nextTarget,
  PAIN_REGIONS,
  periodizedSets,
  planSchedule,
  scheduleWeek,
  validateProgram,
  weekPlan,
  type CatalogExercise,
  type Exposure,
  type MuscleCode,
  type Preference,
  type SetLike,
  type SetTarget,
  type WorkoutExercise,
} from '@atlas/core';
import type {
  AdaptedWorkoutDto,
  PlannedWorkoutDto,
  ProgramDraftDto,
  ProgramWarningDto,
  plannedWorkoutPatchSchema,
  programGenerateSchema,
} from '@atlas/schemas';

import { AppError, notFound } from '../../lib/errors';
import type { ExerciseBundle } from '../exercises/repository';
import type { ExercisesService } from '../exercises/service';
import type { ProfileService } from '../profile/service';
import type { RecoveryService } from '../recovery/service';

import type { HistorySet, PlannedRow, ProgramBundle, TrainingRepository } from './repository';

type Ctx = { userId: string; timezone: string; today: string };

/** Template mínimo para validar (salvo ou rascunho). */
export interface ValidationInput {
  name: string;
  exercises: readonly { exerciseId: string; sets: number; restSeconds: number | null }[];
}

export const programValidationInput = (p: ProgramBundle): ValidationInput[] =>
  p.templates.map((t) => ({ name: t.template.name, exercises: t.exercises }));

const LOWER: readonly MuscleCode[] = ['quads', 'hamstrings', 'glutes'];
const SPLIT_LABELS: Record<string, string> = {
  full_body: 'Full body',
  upper_lower: 'Superior/Inferior',
  upper_lower_ppl: 'Superior/Inferior + PPL',
  ppl: 'Push/Pull/Legs',
};

export function toCatalogExercise(b: ExerciseBundle): CatalogExercise {
  return {
    id: b.exercise.id,
    name: b.exercise.namePt,
    movementPattern: b.exercise.movementPattern,
    mechanics: b.exercise.mechanics,
    equipmentCodes: b.exercise.equipmentCodes,
    contraindicationTags: b.exercise.contraindicationTags,
    primaryMuscles: b.muscles
      .filter((m) => m.role === 'primary')
      .map((m) => m.muscleCode as MuscleCode),
    secondaryMuscles: b.muscles
      .filter((m) => m.role === 'secondary')
      .map((m) => m.muscleCode as MuscleCode),
  };
}

const toSetLike = (s: HistorySet): SetLike => ({
  setType: s.setType,
  reps: s.reps,
  loadKg: s.loadKg,
  rir: s.rir,
  rpe: s.rpe,
  completed: s.completed,
});

/** Exposições anteriores de um exercício, em ordem, marcando as sessões adaptadas (P8.3.4). */
export function exposuresFor(
  history: readonly HistorySet[],
  exerciseId: string,
  before?: { sessionId: string; startedAt: Date },
): Exposure[] {
  const bySession = new Map<string, HistorySet[]>();
  for (const h of history) {
    if (h.exerciseId !== exerciseId) continue;
    if (before && (h.sessionId === before.sessionId || h.sessionStartedAt >= before.startedAt))
      continue;
    bySession.set(h.sessionId, [...(bySession.get(h.sessionId) ?? []), h]);
  }
  return [...bySession.values()]
    .sort(
      (a, b) => (a[0]?.sessionStartedAt.getTime() ?? 0) - (b[0]?.sessionStartedAt.getTime() ?? 0),
    )
    .map((sets) => ({
      date: sets[0]?.date ?? '',
      adapted: sets[0]?.sessionAdapted ?? false,
      sets: sets.map(toSetLike),
    }));
}

/** Dor forte (≥ 7 ou recorrente) bloqueia subir carga no exercício ligado (ADR-046). */
export function blockIncrease(target: SetTarget, previousLoad: number | null): SetTarget {
  return target.action === 'increase'
    ? { ...target, action: 'keep', loadKg: previousLoad }
    : target;
}

export function painLinked(
  e: Pick<CatalogExercise, 'primaryMuscles' | 'contraindicationTags'>,
  regions: readonly { region: keyof typeof PAIN_REGIONS; intensity: number }[],
  minIntensity: number,
) {
  return regions.some((p) => {
    if (p.intensity < minIntensity) return false;
    const link = PAIN_REGIONS[p.region];
    return (
      e.primaryMuscles.some((m) => link.muscles.includes(m)) ||
      e.contraindicationTags.some((t) => link.tags.includes(t))
    );
  });
}

export function createAgendaService(deps: {
  repo: TrainingRepository;
  exercises: ExercisesService;
  profile: ProfileService;
  recovery: () => RecoveryService;
}) {
  const { repo, exercises, profile, recovery } = deps;

  async function catalogMap(userId: string, ids: Iterable<string>) {
    const unique = [...new Set(ids)];
    return new Map(
      (await exercises.bundles(userId, unique)).map((b) => [b.exercise.id, b] as const),
    );
  }

  /** Avisos do validador (P8.7.7) para um programa salvo. */
  async function warnings(
    userId: string,
    list: readonly ValidationInput[],
    info: ReadonlyMap<string, ExerciseBundle>,
  ): Promise<ProgramWarningDto[]> {
    const [tc, sc, names] = await Promise.all([
      profile.trainingContext(userId),
      profile.scheduleContext(userId),
      exercises.muscleNames(),
    ]);
    const templates = list.map(({ name, exercises: exs }) => ({
      name,
      exercises: exs.flatMap((x) => {
        const b = info.get(x.exerciseId);
        return b
          ? [{ exercise: toCatalogExercise(b), sets: x.sets, restSeconds: x.restSeconds }]
          : [];
      }),
    }));
    const lower = (t: (typeof templates)[number]) =>
      t.exercises.some((x) => x.exercise.primaryMuscles.some((m) => LOWER.includes(m)));
    const week = scheduleWeek(
      templates.map((t) => ({ id: t.name, lower: lower(t) })),
      sc.gymDays,
      sc.sportDays,
    );
    return validateProgram({
      templates,
      minutesPerSession: sc.minutesPerSession,
      contraindicated: tc.contraindicated,
      priorities: tc.priorities,
      muscleNames: names,
      schedule: week.map((w) => ({ template: w.templateId, weekday: w.weekday })),
      sportDays: sc.sportDays,
    });
  }

  function toPlannedDto(r: PlannedRow): PlannedWorkoutDto {
    const w = weekPlan(r.planned.weekIndex);
    return {
      id: r.planned.id,
      date: r.planned.date,
      weekIndex: r.planned.weekIndex,
      status: r.planned.status,
      workoutTemplateId: r.planned.workoutTemplateId,
      templateName: r.templateName,
      programId: r.programId,
      rir: w.rir,
      volumeFactor: w.volumeFactor,
      deload: w.deload,
      sessionId: r.sessionId,
    };
  }

  async function getPlanned(userId: string, id: string) {
    const [row] = await repo.listPlanned(userId, { ids: [id] });
    if (!row) throw notFound('Treino agendado');
    return row;
  }

  /** Plano do dia: periodização da semana + adaptação (prontidão e contexto) + metas. */
  async function adapted(
    ctx: Ctx,
    id: string,
    redChoice?: 'light' | 'rest',
  ): Promise<AdaptedWorkoutDto> {
    return (await computeAdapted(ctx, id, redChoice)).dto;
  }

  async function computeAdapted(ctx: Ctx, id: string, redChoice?: 'light' | 'rest') {
    const row = await getPlanned(ctx.userId, id);
    const templateId = row.planned.workoutTemplateId;
    const tpl = templateId ? await repo.getTemplate(ctx.userId, templateId) : undefined;
    if (!tpl) throw notFound('Treino do programa');
    const info = await catalogMap(
      ctx.userId,
      tpl.exercises.map((e) => e.exerciseId),
    );
    const week = weekPlan(row.planned.weekIndex);
    const usable = tpl.exercises.filter((e) => info.has(e.exerciseId));
    const planned: WorkoutExercise[] = usable.flatMap((e) => {
      const b = info.get(e.exerciseId);
      if (!b) return [];
      const c = toCatalogExercise(b);
      return [
        {
          exerciseId: e.exerciseId,
          name: c.name,
          sets: periodizedSets(e.sets, week.volumeFactor),
          repMin: e.repMin,
          repMax: e.repMax,
          targetRir: week.rir,
          restSeconds: e.restSeconds,
          movementPattern: c.movementPattern,
          mechanics: c.mechanics,
          primaryMuscles: c.primaryMuscles,
          contraindicationTags: c.contraindicationTags,
        },
      ];
    });
    const lowerSession = planned.some((e) => e.primaryMuscles.some((m) => LOWER.includes(m)));
    const rec = recovery();
    const [readiness, context, history] = await Promise.all([
      // Prontidão e contexto do dia do treino (não de hoje, se for outro dia).
      rec.readinessFor(ctx.userId, row.planned.date, lowerSession),
      rec.adaptationContext(ctx.userId, row.planned.date),
      repo.historySets(
        ctx.userId,
        planned.map((p) => p.exerciseId),
      ),
    ]);
    const a = adaptWorkout(planned, { readiness, ...context, ...(redChoice ? { redChoice } : {}) });
    const dto: AdaptedWorkoutDto = {
      plannedWorkout: toPlannedDto(row),
      readiness,
      mode: a.mode,
      changed: a.changed,
      noRecords: a.noRecords,
      seeProfessional: a.seeProfessional,
      explanation: a.explanation,
      estimatedMinutes: Math.round(
        estimateMinutes(
          a.exercises
            .filter((e) => !e.removed)
            .map((e) => ({ sets: e.sets, restSeconds: e.restSeconds ?? 120 })),
        ),
      ),
      exercises: a.exercises.map((e, i) => {
        const b = info.get(e.exerciseId);
        const exposures = exposuresFor(history, e.exerciseId);
        const lastLoad =
          exposures
            .at(-1)
            ?.sets.reduce<number | null>(
              (m, s) => (s.loadKg === null ? m : Math.max(m ?? 0, s.loadKg)),
              null,
            ) ?? null;
        const raw = nextTarget(exposures, {
          repMin: e.repMin,
          repMax: e.repMax,
          targetRir: e.targetRir,
          incrementKg: b?.exercise.defaultIncrementKg ?? 2.5,
        });
        // Sessão adaptada não busca progressão; dor forte bloqueia subir carga.
        const target =
          a.noRecords || (b && painLinked(toCatalogExercise(b), context.pain, 7))
            ? blockIncrease(raw, lastLoad)
            : raw;
        return {
          templateExerciseId: usable[i]?.id ?? null,
          exerciseId: e.exerciseId,
          name: e.name,
          sets: e.sets,
          originalSets: e.originalSets,
          repMin: e.repMin,
          repMax: e.repMax,
          targetRir: e.targetRir,
          removed: e.removed,
          substitute: e.substitute,
          target: target.action === 'none' ? null : target,
        };
      }),
    };
    return { dto, readinessAdapted: a.readinessAdapted, usable };
  }

  return {
    warnings,
    catalogMap,

    /** Rascunho de programa pelo motor de regras (P8.7), já validado. */
    async generate(
      ctx: Ctx,
      input: z.output<typeof programGenerateSchema>,
    ): Promise<ProgramDraftDto> {
      const [sc, tc, catalog] = await Promise.all([
        profile.scheduleContext(ctx.userId),
        profile.trainingContext(ctx.userId),
        exercises.catalog(ctx.userId),
      ]);
      const days = input.days ?? Math.min(6, Math.max(2, sc.gymDays.length || 3));
      const minutes = input.minutesPerSession ?? sc.minutesPerSession;
      const preferences = new Map<string, Preference>(
        catalog.flatMap((b) => (b.preference ? [[b.exercise.id, b.preference] as const] : [])),
      );
      const { split, templates } = generateProgram({
        days,
        minutesPerSession: minutes,
        exercises: catalog.map(toCatalogExercise),
        availableEquipment: tc.equipment,
        preferences,
        contraindicated: tc.contraindicated,
        priorities: tc.priorities,
      });
      const info = new Map(catalog.map((b) => [b.exercise.id, b] as const));
      const program = {
        name: `Programa ${SPLIT_LABELS[split] ?? split}`,
        notes: null,
        activate: false,
        templates: templates.map((t) => ({
          name: t.name,
          focusMuscles: t.focusMuscles,
          estimatedMinutes: Math.round(estimateMinutes(t.exercises)),
          exercises: t.exercises.map((x) => ({
            exerciseId: x.exerciseId,
            sets: x.sets,
            repMin: x.repMin,
            repMax: x.repMax,
            targetRir: x.targetRir,
            restSeconds: x.restSeconds,
            supersetGroup: null,
            notes: null,
          })),
        })),
      };
      return {
        split,
        days,
        minutesPerSession: minutes,
        program,
        exerciseNames: Object.fromEntries(
          templates.flatMap((t) => t.exercises.map((x) => [x.exerciseId, x.name])),
        ),
        warnings: await warnings(ctx.userId, program.templates, info),
      };
    },

    /** Mesociclos padrão e agenda a partir de hoje (ADR-043). */
    async materialize(ctx: Ctx, programId: string) {
      const bundle = await repo.getProgram(ctx.userId, programId);
      if (!bundle) return;
      const sc = await profile.scheduleContext(ctx.userId);
      const info = await catalogMap(
        ctx.userId,
        bundle.templates.flatMap((t) => t.exercises.map((e) => e.exerciseId)),
      );
      const usable = bundle.templates.filter((t) => t.exercises.length > 0);
      const templates = usable.map((t) => ({
        id: t.template.id,
        lower: t.exercises.some((e) =>
          info
            .get(e.exerciseId)
            ?.muscles.some(
              (m) => m.role === 'primary' && LOWER.includes(m.muscleCode as MuscleCode),
            ),
        ),
      }));
      const names = new Map(usable.map((t) => [t.template.id, t.template.name]));
      const totalWeeks = DEFAULT_MESOCYCLE.weeks * DEFAULT_MESOCYCLE_COUNT;
      const dates = planSchedule(ctx.today, totalWeeks, templates, sc.gymDays, sc.sportDays);
      const mesos = dates.length
        ? Array.from({ length: DEFAULT_MESOCYCLE_COUNT }, (_, i) => ({
            order: i,
            name: `Mesociclo ${String(i + 1)}`,
            phase: 'accumulation' as const,
            weeks: DEFAULT_MESOCYCLE.weeks,
            startDate: addDays(ctx.today, i * DEFAULT_MESOCYCLE.weeks * 7),
            rirProgression: [...DEFAULT_MESOCYCLE.rir],
            volumeProgression: [...DEFAULT_MESOCYCLE.volume],
          }))
        : [];
      const planned = dates.map((d) => ({
        date: d.date,
        workoutTemplateId: d.templateId,
        programId,
        templateName: names.get(d.templateId) ?? '',
        weekIndex: d.weekIndex % DEFAULT_MESOCYCLE.weeks,
        mesocycleOrder: Math.floor(d.weekIndex / DEFAULT_MESOCYCLE.weeks),
      }));
      await repo.replaceAgenda(ctx.userId, programId, ctx.today, mesos, planned);
    },

    async listPlanned(userId: string, from: string, to: string) {
      return (await repo.listPlanned(userId, { from, to })).map(toPlannedDto);
    },

    async patchPlanned(
      userId: string,
      id: string,
      patch: z.output<typeof plannedWorkoutPatchSchema>,
    ) {
      const current = await getPlanned(userId, id);
      if (current.planned.status === 'done' || current.planned.status === 'adapted') {
        throw new AppError(
          400,
          'BAD_REQUEST',
          'Treino já feito',
          'Um treino já feito não pode ser movido nem pulado.',
        );
      }
      const moved = patch.date !== undefined && patch.date !== current.planned.date;
      await repo.updatePlanned(userId, id, {
        ...(patch.date !== undefined ? { date: patch.date } : {}),
        ...(patch.status !== undefined
          ? { status: patch.status }
          : moved
            ? { status: 'moved' as const }
            : {}),
      });
      return toPlannedDto(await getPlanned(userId, id));
    },

    adapted,

    /** Exercícios da sessão a partir do plano adaptado; marca o planejado (ADR-045/047). */
    async sessionPlan(ctx: Ctx, id: string, redChoice?: 'light' | 'rest') {
      const { dto: plan, readinessAdapted, usable } = await computeAdapted(ctx, id, redChoice);
      const byTemplateExercise = new Map(usable.map((e) => [e.id, e]));
      return {
        name: plan.plannedWorkout.templateName,
        workoutTemplateId: plan.plannedWorkout.workoutTemplateId,
        // Só a adaptação por prontidão tira a sessão da progressão dupla (P8.3.4).
        adapted: readinessAdapted,
        note: plan.explanation.length > 0 ? plan.explanation.join(' ') : null,
        exercises: plan.exercises
          .filter((e) => !e.removed)
          .map((e, i) => ({
            order: i,
            exerciseId: e.exerciseId,
            exerciseName: e.name,
            templateExerciseId: e.templateExerciseId,
            targetSets: e.sets,
            repMin: e.repMin,
            repMax: e.repMax,
            targetRir: e.targetRir,
            restSeconds: e.templateExerciseId
              ? (byTemplateExercise.get(e.templateExerciseId)?.restSeconds ?? null)
              : null,
            notes: e.substitute ? 'Substituir: dor registrada na região.' : null,
          })),
        markPlanned: () =>
          repo.updatePlanned(ctx.userId, id, {
            status: plan.changed ? 'adapted' : 'done',
            adaptationReason: plan.explanation.join(' ') || null,
            adaptedPayload: plan.changed ? { mode: plan.mode, exercises: plan.exercises } : null,
          }),
      };
    },
  };
}

export type AgendaService = ReturnType<typeof createAgendaService>;
