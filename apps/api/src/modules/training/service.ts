import type { z } from 'zod';

import {
  addDays,
  durationMinutes,
  ghostsFor,
  isHardSet,
  localDate,
  nextTarget,
  recordTimeline,
  sessionStats,
  setRowCount,
  tonnage,
  type ExerciseMuscle,
  type MuscleCode,
  type PerformedExercise,
  type RecordHit,
  type SetLike,
} from '@atlas/core';
import type { PersonalRecordRow, SetLogRow, SessionExerciseRow } from '@atlas/db';
import type {
  ExerciseProgress,
  PersonalRecordDto,
  ProgramDto,
  SessionDto,
  SessionSummaryDto,
  SetLogDto,
  SetResult,
  programInputSchema,
  programPatchSchema,
  sessionExerciseInputSchema,
  sessionExercisePatchSchema,
  sessionPatchSchema,
  sessionStartSchema,
  setInputSchema,
  setPatchSchema,
} from '@atlas/schemas';

import { AppError, notFound, validationError } from '../../lib/errors';
import type { ExerciseBundle } from '../exercises/repository';
import type { ExercisesService } from '../exercises/service';
import { toExerciseDto } from '../exercises/service';
import type { RecoveryService } from '../recovery/service';

import {
  blockIncrease,
  exposuresFor,
  painLinked,
  programValidationInput,
  toCatalogExercise,
  type AgendaService,
} from './agenda';
import type {
  HistorySet,
  NewTemplate,
  ProgramBundle,
  SessionBundle,
  TrainingRepository,
} from './repository';

type ProgramInput = z.output<typeof programInputSchema>;
type Ctx = { userId: string; timezone: string; today: string };

const idTaken = () =>
  new AppError(409, 'BAD_REQUEST', 'Identificador já usado', 'Gere um novo id e tente de novo.');

const toSetLike = (s: SetLogRow): SetLike => ({
  setType: s.setType,
  reps: s.reps,
  loadKg: s.loadKg,
  rir: s.rir,
  rpe: s.rpe,
  completed: s.completed,
});

export function toSetDto(s: SetLogRow): SetLogDto {
  return {
    id: s.id,
    sessionExerciseId: s.sessionExerciseId,
    setIndex: s.setIndex,
    setType: s.setType,
    reps: s.reps,
    loadKg: s.loadKg,
    rir: s.rir,
    rpe: s.rpe,
    restSeconds: s.restSeconds,
    durationSeconds: s.durationSeconds,
    completed: s.completed,
    loggedAt: s.loggedAt.toISOString(),
  };
}

function toRecordDto(r: PersonalRecordRow, names: ReadonlyMap<string, string>): PersonalRecordDto {
  return {
    exerciseId: r.exerciseId,
    exerciseName: names.get(r.exerciseId) ?? '',
    type: r.recordType,
    value: r.value,
    reps: r.reps,
    loadKg: r.loadKg,
    achievedAt: r.achievedAt.toISOString(),
  };
}

/** Sessões anteriores (por início) com as séries do exercício, da mais recente à mais antiga. */
function previousSessions(history: readonly HistorySet[], before: Date, excludeSessionId: string) {
  const bySession = new Map<string, HistorySet[]>();
  for (const h of history) {
    if (h.sessionId === excludeSessionId || h.sessionStartedAt >= before) continue;
    const list = bySession.get(h.sessionId) ?? [];
    list.push(h);
    bySession.set(h.sessionId, list);
  }
  return [...bySession.values()].sort(
    (a, b) => (b[0]?.sessionStartedAt.getTime() ?? 0) - (a[0]?.sessionStartedAt.getTime() ?? 0),
  );
}

export function createTrainingService(deps: {
  repo: TrainingRepository;
  exercises: ExercisesService;
  /** Agenda, gerador e adaptação (ligação tardia, ADR-043/045). */
  agenda: () => AgendaService;
  /** Dores para bloquear progressão (ADR-046); ligação tardia. */
  recovery: () => RecoveryService;
}) {
  const { repo, exercises, agenda, recovery } = deps;

  async function bundleMap(userId: string, ids: Iterable<string>) {
    const unique = [...new Set(ids)];
    return new Map(
      (await exercises.bundles(userId, unique)).map((b) => [b.exercise.id, b] as const),
    );
  }

  async function assertExercises(
    userId: string,
    ids: readonly string[],
    field: (i: number) => string,
  ) {
    const found = await bundleMap(userId, ids);
    const errors = ids.flatMap((id, i) =>
      found.has(id) ? [] : [{ field: field(i), message: 'Exercício não encontrado' }],
    );
    if (errors.length > 0) throw validationError(errors);
    return found;
  }

  // Programas -------------------------------------------------------------

  function toProgramDto(
    b: ProgramBundle,
    names: ReadonlyMap<string, ExerciseBundle>,
    warnings: ProgramDto['warnings'],
  ): ProgramDto {
    const p = b.program;
    return {
      id: p.id,
      name: p.name,
      notes: p.notes,
      status: p.status,
      startDate: p.startDate,
      endDate: p.endDate,
      createdAt: p.createdAt.toISOString(),
      templates: b.templates.map(({ template: t, exercises: exs }) => ({
        id: t.id,
        name: t.name,
        dayOrder: t.dayOrder,
        focusMuscles: t.focusMuscles,
        estimatedMinutes: t.estimatedMinutes,
        exercises: exs.map((e) => ({
          id: e.id,
          order: e.order,
          exerciseId: e.exerciseId,
          exerciseName: names.get(e.exerciseId)?.exercise.namePt ?? '',
          sets: e.sets,
          repMin: e.repMin,
          repMax: e.repMax,
          targetRir: e.targetRir,
          restSeconds: e.restSeconds,
          supersetGroup: e.supersetGroup,
          notes: e.notes,
        })),
      })),
      warnings,
    };
  }

  async function programDtos(userId: string, bundles: ProgramBundle[]) {
    const names = await bundleMap(
      userId,
      bundles.flatMap((b) => b.templates.flatMap((t) => t.exercises.map((e) => e.exerciseId))),
    );
    return Promise.all(
      bundles.map(async (b) =>
        toProgramDto(b, names, await agenda().warnings(userId, programValidationInput(b), names)),
      ),
    );
  }

  async function newTemplates(userId: string, templates: ProgramInput['templates']) {
    const ids = templates.flatMap((t) => t.exercises.map((e) => e.exerciseId));
    const found = await bundleMap(userId, ids);
    const errors = templates.flatMap((t, ti) =>
      t.exercises.flatMap((e, ei) =>
        found.has(e.exerciseId)
          ? []
          : [
              {
                field: `templates.${String(ti)}.exercises.${String(ei)}.exerciseId`,
                message: 'Exercício não encontrado',
              },
            ],
      ),
    );
    if (errors.length > 0) throw validationError(errors);
    return templates.map<NewTemplate>((t, ti) => ({
      name: t.name,
      dayOrder: ti,
      focusMuscles: t.focusMuscles,
      estimatedMinutes: t.estimatedMinutes ?? null,
      exercises: t.exercises.map((e, ei) => ({
        order: ei,
        exerciseId: e.exerciseId,
        sets: e.sets,
        repMin: e.repMin,
        repMax: e.repMax,
        targetRir: e.targetRir,
        restSeconds: e.restSeconds,
        supersetGroup: e.supersetGroup ?? null,
        notes: e.notes ?? null,
      })),
    }));
  }

  async function getProgram(userId: string, id: string) {
    const b = await repo.getProgram(userId, id);
    if (!b) throw notFound('Programa');
    const [dto] = await programDtos(userId, [b]);
    if (!dto) throw notFound('Programa');
    return dto;
  }

  // Sessões ---------------------------------------------------------------

  async function toSessionDto(userId: string, b: SessionBundle): Promise<SessionDto> {
    const { session, sets, records } = b;
    const exIds = b.exercises.map((e) => e.exerciseId);
    const [info, history, context] = await Promise.all([
      bundleMap(userId, [...exIds, ...records.map((r) => r.exerciseId)]),
      repo.historySets(userId, exIds),
      recovery().adaptationContext(userId, session.date),
    ]);
    const names = new Map([
      ...[...info.values()].map((x) => [x.exercise.id, x.exercise.namePt] as const),
      ...b.exercises.map((e) => [e.exerciseId, e.exerciseName] as const),
    ]);
    const exercisesDto = b.exercises.map((se) => {
      const own = sets.filter((s) => s.sessionExerciseId === se.id);
      const last = previousSessions(
        history.filter((h) => h.exerciseId === se.exerciseId),
        session.startedAt,
        session.id,
      ).find((list) => list.some((s) => s.completed && s.setType === 'working'));
      const setCount = setRowCount(
        se.targetSets,
        0,
        own.map((x) => x.setIndex),
      );
      const bundle = info.get(se.exerciseId);
      const exposures = exposuresFor(history, se.exerciseId, {
        sessionId: session.id,
        startedAt: session.startedAt,
      });
      const lastLoad =
        exposures
          .at(-1)
          ?.sets.reduce<number | null>(
            (m, x) => (x.loadKg === null ? m : Math.max(m ?? 0, x.loadKg)),
            null,
          ) ?? null;
      const raw = nextTarget(exposures, {
        repMin: se.repMin ?? 8,
        repMax: se.repMax ?? 12,
        targetRir: se.targetRir,
        incrementKg: bundle?.exercise.defaultIncrementKg ?? 2.5,
      });
      // Sessão adaptada não busca progressão; dor forte bloqueia subir carga (ADR-045/046).
      const target =
        session.adapted || (bundle && painLinked(toCatalogExercise(bundle), context.pain, 7))
          ? blockIncrease(raw, lastLoad)
          : raw;
      return {
        id: se.id,
        order: se.order,
        exerciseId: se.exerciseId,
        exerciseName: se.exerciseName,
        loadType: bundle?.exercise.loadType ?? 'external',
        defaultIncrementKg: bundle?.exercise.defaultIncrementKg ?? 2.5,
        templateExerciseId: se.templateExerciseId,
        substitutedFromExerciseId: se.substitutedFromExerciseId,
        status: se.status,
        skipReason: se.skipReason,
        targetSets: se.targetSets,
        repMin: se.repMin,
        repMax: se.repMax,
        targetRir: se.targetRir,
        restSeconds: se.restSeconds,
        notes: se.notes,
        ghosts: ghostsFor(setCount, last ?? []),
        target: target.action === 'none' ? null : target,
        sets: own.map(toSetDto),
      };
    });
    const like = sets.map(toSetLike);
    return {
      id: session.id,
      date: session.date,
      name: session.name,
      workoutTemplateId: session.workoutTemplateId,
      plannedWorkoutId: session.plannedWorkoutId,
      adapted: session.adapted,
      adaptationNote: session.adaptationNote,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
      durationMin: session.durationMin,
      sessionRpe: session.sessionRpe,
      perceivedDifficulty: session.perceivedDifficulty,
      notes: session.notes,
      source: session.source,
      exercises: exercisesDto,
      tonnage: tonnage(like),
      hardSets: like.filter(isHardSet).length,
      records: records.map((r) => toRecordDto(r, names)),
    };
  }

  async function getSession(userId: string, id: string) {
    const b = await repo.getSession(userId, id);
    if (!b) throw notFound('Treino');
    return toSessionDto(userId, b);
  }

  async function ownedSessionExercise(userId: string, id: string) {
    const row = await repo.getSessionExercise(userId, id);
    if (!row) throw notFound('Exercício do treino');
    return row;
  }

  /**
   * Recalcula todos os recordes dos exercícios a partir do histórico (P8.1, recalculável):
   * editar ou apagar uma série corrige também os recordes posteriores. Devolve os
   * recordes por série.
   */
  async function rebuildRecords(userId: string, exerciseIds: Iterable<string>) {
    const bySet = new Map<string, RecordHit[]>();
    for (const exerciseId of new Set(exerciseIds)) {
      await repo.rebuildExerciseRecords(userId, exerciseId, (history) => {
        const sessions = new Map<string, HistorySet[]>();
        for (const h of history)
          sessions.set(h.sessionId, [...(sessions.get(h.sessionId) ?? []), h]);
        const ordered = [...sessions.values()];
        const timeline = recordTimeline(
          ordered.map((sets) => ({
            id: sets[0]?.sessionId ?? '',
            finished: sets[0]?.sessionEndedAt != null,
            sets: sets.map((x) => ({ id: x.id, ...toSetLike(x) })),
          })),
        );
        const rows: {
          recordType: RecordHit['type'];
          value: number;
          reps: number | null;
          loadKg: number | null;
          setLogId: string | null;
          sessionId: string;
          achievedAt: Date;
        }[] = history.flatMap((h) =>
          (timeline.bySet.get(h.id) ?? []).map((hit) => ({
            recordType: hit.type,
            value: hit.value,
            reps: hit.reps,
            loadKg: hit.loadKg,
            setLogId: h.id,
            sessionId: h.sessionId,
            achievedAt: h.loggedAt,
          })),
        );
        for (const sets of ordered) {
          const first = sets[0];
          const hit = first ? timeline.bySession.get(first.sessionId) : undefined;
          if (!first || !hit) continue;
          rows.push({
            recordType: hit.type,
            value: hit.value,
            reps: null,
            loadKg: null,
            setLogId: null,
            sessionId: first.sessionId,
            achievedAt: first.sessionEndedAt ?? first.sessionStartedAt,
          });
        }
        for (const [setId, hits] of timeline.bySet) bySet.set(setId, hits);
        return rows;
      });
    }
    return bySet;
  }

  return {
    // Programas -----------------------------------------------------------

    async listPrograms(userId: string) {
      return programDtos(userId, await repo.listPrograms(userId));
    },

    getProgram,

    async createProgram(ctx: Ctx, input: ProgramInput) {
      const templates = await newTemplates(ctx.userId, input.templates);
      const id = await repo.createProgram(
        ctx.userId,
        {
          name: input.name,
          notes: input.notes ?? null,
          activate: input.activate,
          startDate: ctx.today,
        },
        templates,
      );
      if (input.activate) await agenda().materialize(ctx, id);
      return getProgram(ctx.userId, id);
    },

    async updateProgram(ctx: Ctx, id: string, patch: z.output<typeof programPatchSchema>) {
      const templates = patch.templates
        ? await newTemplates(ctx.userId, patch.templates)
        : undefined;
      const ended = patch.status === 'completed' || patch.status === 'archived';
      const ok = await repo.updateProgram(
        ctx.userId,
        id,
        {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(ended ? { endDate: ctx.today } : {}),
        },
        templates,
      );
      if (!ok) throw notFound('Programa');
      // Templates novos no programa ativo: refaz só a agenda futura.
      if (templates && (await repo.getProgram(ctx.userId, id))?.program.status === 'active') {
        await agenda().materialize(ctx, id);
      }
      return getProgram(ctx.userId, id);
    },

    async activateProgram(ctx: Ctx, id: string) {
      const result = await repo.activateProgram(ctx.userId, id, ctx.today);
      if (!result) throw notFound('Programa');
      // Já ativo: a agenda (e o histórico dela) fica como está (ADR-047).
      if (result === 'activated') await agenda().materialize(ctx, id);
      return getProgram(ctx.userId, id);
    },

    // Sessões -------------------------------------------------------------

    /** Inicia a partir de um template (metas copiadas) ou vazio; idempotente pelo id do cliente. */
    async startSession(ctx: Ctx, input: z.output<typeof sessionStartSchema>) {
      const { userId } = ctx;
      if (input.id) {
        const existing = await repo.getSession(userId, input.id);
        if (existing) return { created: false, session: await toSessionDto(userId, existing) };
        if (await repo.sessionIdTaken(input.id)) throw idTaken();
      }
      const startedAt = input.startedAt ? new Date(input.startedAt) : new Date();
      let name = input.name;
      let seRows: Parameters<TrainingRepository['createSession']>[2] = [];
      let templateId = input.workoutTemplateId ?? null;
      let plan: Awaited<ReturnType<AgendaService['sessionPlan']>> | null = null;
      if (input.plannedWorkoutId) {
        // Já iniciado a partir deste planejado: devolve a mesma sessão.
        const running = await repo.sessionForPlanned(userId, input.plannedWorkoutId);
        const existing = running ? await repo.getSession(userId, running) : undefined;
        if (existing) return { created: false, session: await toSessionDto(userId, existing) };
        // Treino agendado já adaptado ao dia (ADR-045).
        plan = await agenda().sessionPlan(ctx, input.plannedWorkoutId, input.redChoice);
        name ??= plan.name;
        templateId = plan.workoutTemplateId;
        seRows = plan.exercises;
      } else if (input.workoutTemplateId) {
        const tpl = await repo.getTemplate(userId, input.workoutTemplateId);
        if (!tpl) throw notFound('Treino do programa');
        const info = await bundleMap(
          userId,
          tpl.exercises.map((e) => e.exerciseId),
        );
        name ??= tpl.template.name;
        seRows = tpl.exercises.map((e, i) => ({
          order: i,
          exerciseId: e.exerciseId,
          exerciseName: info.get(e.exerciseId)?.exercise.namePt ?? '',
          templateExerciseId: e.id,
          targetSets: e.sets,
          repMin: e.repMin,
          repMax: e.repMax,
          targetRir: e.targetRir,
          restSeconds: e.restSeconds,
          notes: e.notes,
        }));
      }
      const { id, created } = await repo.createSession(
        userId,
        {
          ...(input.id ? { id: input.id } : {}),
          date: localDate(startedAt, ctx.timezone),
          workoutTemplateId: templateId,
          plannedWorkoutId: input.plannedWorkoutId ?? null,
          adapted: plan?.adapted ?? false,
          adaptationNote: plan?.note ?? null,
          name: name ?? 'Treino',
          startedAt,
        },
        seRows,
      );
      if (created && plan) await plan.markPlanned();
      if (!created) {
        // Corrida entre duas tentativas com o mesmo id.
        const again = input.id ? await repo.getSession(userId, input.id) : undefined;
        if (!again) throw idTaken();
        return { created: false, session: await toSessionDto(userId, again) };
      }
      return { created: true, session: await getSession(userId, id) };
    },

    getSession,

    async listSessions(ctx: Ctx, query: { from?: string | undefined; to?: string | undefined }) {
      const to = query.to ?? ctx.today;
      const from = query.from ?? addDays(to, -89);
      const {
        sessions,
        exercises: exs,
        sets,
        records,
      } = await repo.listSessions(ctx.userId, from, to);
      return sessions.map<SessionSummaryDto>((s) => {
        const seIds = new Set(exs.filter((e) => e.sessionId === s.id).map((e) => e.id));
        const own = sets.filter((x) => seIds.has(x.sessionExerciseId));
        return {
          id: s.id,
          date: s.date,
          name: s.name,
          startedAt: s.startedAt.toISOString(),
          endedAt: s.endedAt?.toISOString() ?? null,
          durationMin: s.durationMin,
          sessionRpe: s.sessionRpe,
          exerciseCount: seIds.size,
          setCount: own.filter((x) => x.completed).length,
          tonnage: tonnage(own.map(toSetLike)),
          recordCount: records.filter((r) => r.sessionId === s.id).length,
        };
      });
    },

    /** Edita ou finaliza; finalizar fecha pendentes e calcula recordes de tonelagem. */
    async patchSession(userId: string, id: string, patch: z.output<typeof sessionPatchSchema>) {
      const current = await repo.getSession(userId, id);
      if (!current) throw notFound('Treino');
      const values: Parameters<TrainingRepository['updateSession']>[2] = {};
      if (patch.sessionRpe !== undefined) values.sessionRpe = patch.sessionRpe;
      if (patch.perceivedDifficulty !== undefined)
        values.perceivedDifficulty = patch.perceivedDifficulty;
      if (patch.notes !== undefined) values.notes = patch.notes;
      if (patch.source !== undefined && current.session.source !== 'import')
        values.source = patch.source;
      if (patch.durationMin !== undefined) values.durationMin = patch.durationMin;
      const endedAt = patch.endedAt
        ? new Date(patch.endedAt)
        : patch.finish
          ? (current.session.endedAt ?? new Date())
          : undefined;
      if (endedAt) {
        if (endedAt < current.session.startedAt) {
          throw validationError([{ field: 'endedAt', message: 'O fim deve ser depois do início' }]);
        }
        values.endedAt = endedAt;
        if (patch.durationMin === undefined) {
          values.durationMin = durationMinutes(current.session.startedAt, endedAt);
        }
      }
      await repo.updateSession(userId, id, values);
      if (patch.finish) {
        await repo.markPendingExercises(id);
      }
      if (endedAt)
        await rebuildRecords(
          userId,
          current.exercises.map((e) => e.exerciseId),
        );
      return getSession(userId, id);
    },

    async deleteSession(userId: string, id: string) {
      const current = await repo.getSession(userId, id);
      if (!current || !(await repo.softDeleteSession(userId, id))) throw notFound('Treino');
      // O treino agendado volta a ficar disponível para começar de novo.
      if (current.session.plannedWorkoutId) {
        await repo.updatePlanned(userId, current.session.plannedWorkoutId, {
          status: 'planned',
          adaptationReason: null,
          adaptedPayload: null,
        });
      }
      await rebuildRecords(
        userId,
        current.exercises.map((e) => e.exerciseId),
      );
    },

    async addExercise(
      userId: string,
      sessionId: string,
      input: z.output<typeof sessionExerciseInputSchema>,
    ) {
      const current = await repo.getSession(userId, sessionId);
      if (!current) throw notFound('Treino');
      if (input.id) {
        const existing = current.exercises.find((e) => e.id === input.id);
        if (existing) return { created: false, session: await toSessionDto(userId, current) };
        if (await repo.sessionExerciseIdTaken(input.id)) throw idTaken();
      }
      const info = await assertExercises(userId, [input.exerciseId], () => 'exerciseId');
      await repo.insertSessionExercise({
        ...(input.id ? { id: input.id } : {}),
        sessionId,
        order: await repo.nextExerciseOrder(sessionId),
        exerciseId: input.exerciseId,
        exerciseName: info.get(input.exerciseId)?.exercise.namePt ?? '',
        targetSets: input.targetSets,
        repMin: input.repMin,
        repMax: input.repMax,
        restSeconds: input.restSeconds,
      });
      return { created: true, session: await getSession(userId, sessionId) };
    },

    /** Pular (com motivo), reabrir ou substituir (só antes de registrar séries). */
    async patchSessionExercise(
      userId: string,
      id: string,
      patch: z.output<typeof sessionExercisePatchSchema>,
    ) {
      const { exercise: se, session } = await ownedSessionExercise(userId, id);
      const values: Partial<SessionExerciseRow> = {};
      if (patch.substituteExerciseId && patch.substituteExerciseId !== se.exerciseId) {
        if ((await repo.countSets(se.id)) > 0) {
          throw new AppError(
            400,
            'BAD_REQUEST',
            'Exercício já tem séries',
            'Remova as séries registradas antes de substituir.',
          );
        }
        const info = await assertExercises(
          userId,
          [patch.substituteExerciseId],
          () => 'substituteExerciseId',
        );
        // Voltar ao exercício original desfaz a substituição.
        const original = se.substitutedFromExerciseId ?? se.exerciseId;
        const reverting = patch.substituteExerciseId === original;
        values.substitutedFromExerciseId = reverting ? null : original;
        values.exerciseId = patch.substituteExerciseId;
        values.exerciseName = info.get(patch.substituteExerciseId)?.exercise.namePt ?? '';
        values.status = reverting ? 'pending' : 'substituted';
        values.skipReason = null;
      }
      if (patch.status !== undefined) {
        const substituted =
          values.substitutedFromExerciseId !== undefined
            ? values.substitutedFromExerciseId !== null
            : se.substitutedFromExerciseId !== null;
        // Retomar um exercício substituído mantém a marca (ADR-036).
        values.status = patch.status !== 'skipped' && substituted ? 'substituted' : patch.status;
        if (patch.status !== 'skipped') values.skipReason = null;
      }
      if (patch.skipReason !== undefined && (values.status ?? se.status) === 'skipped') {
        values.skipReason = patch.skipReason;
      }
      if (patch.notes !== undefined) values.notes = patch.notes;
      if (Object.keys(values).length > 0) await repo.updateSessionExercise(se.id, values);
      return getSession(userId, session.id);
    },

    // Séries --------------------------------------------------------------

    /** Idempotente pelo id do cliente; devolve os recordes batidos (P8.1). */
    async createSet(
      userId: string,
      sessionExerciseId: string,
      input: z.output<typeof setInputSchema>,
    ): Promise<{ created: boolean; result: SetResult }> {
      const { exercise: se } = await ownedSessionExercise(userId, sessionExerciseId);
      if (input.id) {
        const existing = await repo.getSet(userId, input.id);
        if (existing) {
          if (existing.set.sessionExerciseId !== sessionExerciseId) throw idTaken();
          const records = await repo.setRecords(userId, input.id);
          return {
            created: false,
            result: {
              set: toSetDto(existing.set),
              records: records.map((r) => ({
                type: r.recordType,
                value: r.value,
                reps: r.reps,
                loadKg: r.loadKg,
              })),
            },
          };
        }
        if (await repo.setIdTaken(input.id)) throw idTaken();
      }
      const row = await repo.insertSet({
        ...(input.id ? { id: input.id } : {}),
        sessionExerciseId,
        setIndex: input.setIndex,
        setType: input.setType,
        reps: input.reps ?? null,
        loadKg: input.loadKg ?? null,
        rir: input.rir ?? null,
        rpe: input.rpe ?? null,
        restSeconds: input.restSeconds ?? null,
        durationSeconds: input.durationSeconds ?? null,
        completed: input.completed,
        ...(input.loggedAt ? { loggedAt: new Date(input.loggedAt) } : {}),
      });
      if (!row) throw idTaken();
      if (se.status === 'skipped') {
        await repo.updateSessionExercise(se.id, {
          status: se.substitutedFromExerciseId ? 'substituted' : 'pending',
          skipReason: null,
        });
      }
      const records = (await rebuildRecords(userId, [se.exerciseId])).get(row.id) ?? [];
      return { created: true, result: { set: toSetDto(row), records } };
    },

    async patchSet(
      userId: string,
      id: string,
      patch: z.output<typeof setPatchSchema>,
    ): Promise<SetResult> {
      const found = await repo.getSet(userId, id);
      if (!found) throw notFound('Série');
      const values: Partial<SetLogRow> = {};
      for (const key of [
        'setType',
        'reps',
        'loadKg',
        'rir',
        'rpe',
        'restSeconds',
        'durationSeconds',
        'completed',
      ] as const) {
        if (patch[key] !== undefined) Object.assign(values, { [key]: patch[key] });
      }
      if (patch.loggedAt !== undefined) values.loggedAt = new Date(patch.loggedAt);
      const row = Object.keys(values).length > 0 ? await repo.updateSet(id, values) : found.set;
      if (!row) throw notFound('Série');
      const records = (await rebuildRecords(userId, [found.exercise.exerciseId])).get(row.id) ?? [];
      return { set: toSetDto(row), records };
    },

    async deleteSet(userId: string, id: string) {
      const found = await repo.getSet(userId, id);
      if (!found) throw notFound('Série');
      await repo.deleteSet(id);
      await rebuildRecords(userId, [found.exercise.exerciseId]);
    },

    // Progresso e volume -------------------------------------------------

    /** Progresso por exercício: e1RM, maior carga e tonelagem por sessão + recordes. */
    async progress(
      ctx: Ctx,
      exerciseId: string,
      query: { from?: string | undefined; to?: string | undefined },
    ): Promise<ExerciseProgress> {
      const bundle = await exercises.getBundle(ctx.userId, exerciseId);
      const to = query.to ?? ctx.today;
      const from = query.from ?? addDays(to, -364);
      const [history, records] = await Promise.all([
        repo.historySets(ctx.userId, [exerciseId], { from, to }),
        repo.exerciseRecords(ctx.userId, exerciseId),
      ]);
      const bySession = new Map<string, HistorySet[]>();
      for (const h of history)
        bySession.set(h.sessionId, [...(bySession.get(h.sessionId) ?? []), h]);
      const points = [...bySession.entries()].flatMap(([sessionId, list]) => {
        const stats = sessionStats(list.map(toSetLike));
        const first = list[0];
        if (!first || stats.workingSets === 0) return [];
        return [
          {
            date: first.date,
            sessionId,
            bestE1rm: stats.bestE1rm,
            topLoadKg: stats.topLoadKg,
            tonnage: stats.tonnage,
            workingSets: stats.workingSets,
          },
        ];
      });
      const names = new Map([[exerciseId, bundle.exercise.namePt]]);
      return {
        exercise: toExerciseDto(bundle),
        points,
        records: records.map((r) => toRecordDto(r.personal_records, names)),
      };
    },

    /** Exercícios executados num intervalo, com mapeamento muscular (volume semanal). */
    async performedInRange(userId: string, from: string, to: string): Promise<PerformedExercise[]> {
      const sets = await repo.setsInRange(userId, from, to);
      const info = await bundleMap(
        userId,
        sets.map((s) => s.exerciseId),
      );
      const groups = new Map<string, HistorySet[]>();
      for (const s of sets)
        groups.set(s.sessionExerciseId, [...(groups.get(s.sessionExerciseId) ?? []), s]);
      return [...groups.values()].flatMap((list) => {
        const first = list[0];
        const b = first ? info.get(first.exerciseId) : undefined;
        if (!first || !b) return [];
        const muscles: ExerciseMuscle[] = b.muscles.map((m) => ({
          muscle: m.muscleCode as MuscleCode,
          weight: m.weight,
        }));
        return [{ date: first.date, muscles, sets: list.map(toSetLike) }];
      });
    },
  };
}

export type TrainingService = ReturnType<typeof createTrainingService>;
