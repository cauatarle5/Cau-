'use client';

import { uuidv7 } from 'uuidv7';
import { create } from 'zustand';

import { kvDel, kvGet, kvSet, onOfflineUserChange } from '@/offline/kv';
import { enqueue, onSynced, useSyncStore, type QueuedOp } from '@/offline/queue';
import { setRowCount } from '@atlas/core';
import {
  sessionSchema,
  setResultSchema,
  type ExerciseDto,
  type SessionDto,
  type SessionExerciseDto,
} from '@atlas/schemas';

import { trainingApi } from './api';

export interface RecordNotice {
  setId: string;
  exerciseName: string;
  types: string[];
}

interface Persisted {
  session: SessionDto;
  finished: boolean;
  offline: boolean;
  extraSets: Record<string, number>;
  owned: boolean;
  /** Descanso em andamento (horário absoluto): sobrevive a recarregar a página. */
  rest?: { endsAt: number; total: number } | null;
}

interface ActiveState {
  session: SessionDto | null;
  finished: boolean;
  /** Alguma escrita foi feita sem rede (`source = offline_sync`, ADR-034). */
  offline: boolean;
  extraSets: Record<string, number>;
  /** Iniciado neste aparelho. */
  owned: boolean;
  rest: { endsAt: number; total: number } | null;
  records: RecordNotice[];
  loading: boolean;
  error: string | null;
}

const ACTIVE_KEY = 'active-session';
const sessionKey = (id: string) => `session:${id}`;

export const useActiveWorkout = create<ActiveState>(() => ({
  session: null,
  finished: false,
  offline: false,
  extraSets: {},
  owned: false,
  rest: null,
  records: [],
  loading: false,
  error: null,
}));

const get = () => useActiveWorkout.getState();

async function persist() {
  const { session, finished, offline, extraSets, owned, rest } = get();
  if (!session) return;
  const data: Persisted = { session, finished, offline, extraSets, owned, rest };
  await kvSet(sessionKey(session.id), data);
  // Só o treino iniciado neste aparelho vira o "em andamento" (abrir outro do histórico não troca).
  const current = await kvGet<string>(ACTIVE_KEY);
  if (finished) {
    if (current === session.id) await kvDel(ACTIVE_KEY);
  } else if (owned) {
    await kvSet(ACTIVE_KEY, session.id);
  }
}

function update(fn: (s: SessionDto) => SessionDto, extra: Partial<ActiveState> = {}) {
  const { session } = get();
  if (!session) return;
  const offline = get().offline || (typeof navigator !== 'undefined' && !navigator.onLine);
  useActiveWorkout.setState({ session: fn(session), offline, ...extra });
  void persist();
}

function updateExercise(id: string, fn: (e: SessionExerciseDto) => SessionExerciseDto) {
  update((s) => ({ ...s, exercises: s.exercises.map((e) => (e.id === id ? fn(e) : e)) }));
}

/** Id da sessão em andamento neste aparelho (para retomar). */
export const activeSessionId = () => kvGet<string>(ACTIVE_KEY);

/** Carrega do aparelho (fonte da verdade durante o treino) ou do servidor. */
export async function loadSession(id: string, fresh?: SessionDto) {
  if (get().session?.id === id) return;
  useActiveWorkout.setState({ loading: true, error: null, records: [], rest: null });
  const local = await kvGet<Persisted>(sessionKey(id));
  if (local) {
    const rest = local.rest && local.rest.endsAt > Date.now() ? local.rest : null;
    useActiveWorkout.setState({ ...local, rest, loading: false });
    return;
  }
  try {
    const session = fresh ?? (await trainingApi.session(id));
    useActiveWorkout.setState({
      session,
      finished: session.endedAt !== null,
      offline: false,
      extraSets: {},
      owned: fresh !== undefined,
      loading: false,
    });
    if (session.endedAt === null) await persist();
  } catch {
    useActiveWorkout.setState({ loading: false, error: 'Não foi possível carregar o treino.' });
  }
}

export function rowCount(e: SessionExerciseDto, extra = 0) {
  return setRowCount(
    e.targetSets,
    e.ghosts.length,
    e.sets.map((s) => s.setIndex),
    extra,
  );
}

export const activeActions = {
  logSet(
    se: SessionExerciseDto,
    values: { setIndex: number; loadKg: number | null; reps: number | null; rir: number | null },
  ) {
    const id = uuidv7();
    const loggedAt = new Date().toISOString();
    const body = { id, ...values, setType: 'working' as const, completed: true, loggedAt };
    updateExercise(se.id, (e) => ({
      ...e,
      status: e.status === 'skipped' ? 'pending' : e.status,
      skipReason: e.status === 'skipped' ? null : e.skipReason,
      sets: [
        ...e.sets,
        {
          ...body,
          sessionExerciseId: se.id,
          rpe: null,
          restSeconds: null,
          durationSeconds: null,
        },
      ],
    }));
    void enqueue({ method: 'POST', path: `/session-exercises/${se.id}/sets`, body });
    const rest = se.restSeconds ?? 120;
    if (rest > 0) activeActions.startRest(rest);
  },

  deleteSet(seId: string, setId: string) {
    updateExercise(seId, (e) => ({ ...e, sets: e.sets.filter((s) => s.id !== setId) }));
    void enqueue({ method: 'DELETE', path: `/sets/${setId}` });
  },

  addSetRow(seId: string) {
    const extraSets = { ...get().extraSets, [seId]: (get().extraSets[seId] ?? 0) + 1 };
    update((s) => s, { extraSets });
  },

  skip(seId: string, reason: string | null) {
    updateExercise(seId, (e) => ({ ...e, status: 'skipped', skipReason: reason }));
    void enqueue({
      method: 'PATCH',
      path: `/session-exercises/${seId}`,
      body: { status: 'skipped', skipReason: reason },
    });
  },

  unskip(seId: string) {
    updateExercise(seId, (e) => ({ ...e, status: 'pending', skipReason: null }));
    void enqueue({
      method: 'PATCH',
      path: `/session-exercises/${seId}`,
      body: { status: 'pending' },
    });
  },

  /** Substituto escolhido da lista de alternativas; fantasmas chegam ao sincronizar. */
  substitute(seId: string, exercise: ExerciseDto) {
    updateExercise(seId, (e) => ({
      ...e,
      substitutedFromExerciseId: e.substitutedFromExerciseId ?? e.exerciseId,
      exerciseId: exercise.id,
      exerciseName: exercise.namePt,
      loadType: exercise.loadType,
      defaultIncrementKg: exercise.defaultIncrementKg,
      status: 'substituted',
      skipReason: null,
      ghosts: [],
      // A meta da progressão era do exercício original.
      target: null,
    }));
    void enqueue({
      method: 'PATCH',
      path: `/session-exercises/${seId}`,
      body: { substituteExerciseId: exercise.id },
    });
  },

  addExercise(exercise: ExerciseDto) {
    const session = get().session;
    if (!session) return;
    const id = uuidv7();
    const order = session.exercises.reduce((m, e) => Math.max(m, e.order + 1), 0);
    update((s) => ({
      ...s,
      exercises: [
        ...s.exercises,
        {
          id,
          order,
          exerciseId: exercise.id,
          exerciseName: exercise.namePt,
          loadType: exercise.loadType,
          defaultIncrementKg: exercise.defaultIncrementKg,
          templateExerciseId: null,
          substitutedFromExerciseId: null,
          status: 'pending',
          skipReason: null,
          targetSets: 3,
          repMin: 8,
          repMax: 12,
          targetRir: null,
          restSeconds: 120,
          notes: null,
          ghosts: [],
          target: null,
          sets: [],
        },
      ],
    }));
    void enqueue({
      method: 'POST',
      path: `/sessions/${session.id}/exercises`,
      body: { id, exerciseId: exercise.id },
    });
  },

  /** Registro de dor durante o exercício (ADR-046), também pela fila offline. */
  reportPain(exerciseId: string, bodyRegion: string, intensity: number) {
    const session = get().session;
    if (!session) return;
    void enqueue({
      method: 'POST',
      path: '/pain-reports',
      body: {
        date: session.date,
        bodyRegion,
        intensity,
        sessionId: session.id,
        duringExerciseId: exerciseId,
      },
    });
  },

  finish(values: { sessionRpe: number | null; notes: string | null }) {
    const { session, offline } = get();
    if (!session) return;
    const endedAt = new Date().toISOString();
    const nowOffline = offline || (typeof navigator !== 'undefined' && !navigator.onLine);
    update((s) => ({ ...s, endedAt, sessionRpe: values.sessionRpe, notes: values.notes }), {
      finished: true,
      rest: null,
    });
    void enqueue({
      method: 'PATCH',
      path: `/sessions/${session.id}`,
      body: {
        finish: true,
        endedAt,
        sessionRpe: values.sessionRpe,
        notes: values.notes,
        source: nowOffline ? 'offline_sync' : 'app',
      },
    });
  },

  startRest(seconds: number) {
    useActiveWorkout.setState({ rest: { endsAt: Date.now() + seconds * 1000, total: seconds } });
    void persist();
  },

  addRest(seconds: number) {
    const rest = get().rest;
    if (rest)
      useActiveWorkout.setState({ rest: { ...rest, endsAt: rest.endsAt + seconds * 1000 } });
    void persist();
  },

  clearRest() {
    useActiveWorkout.setState({ rest: null });
    void persist();
  },

  /** Encerra a sessão local depois de sincronizada. */
  async close() {
    const session = get().session;
    if (session) await kvDel(sessionKey(session.id));
    if (session && (await kvGet<string>(ACTIVE_KEY)) === session.id) await kvDel(ACTIVE_KEY);
    useActiveWorkout.setState({
      session: null,
      finished: false,
      offline: false,
      extraSets: {},
      owned: false,
    });
  },
};

/** Respostas da fila: recordes das séries e fantasmas de exercícios adicionados/substituídos. */
function handleSynced(op: QueuedOp, response: unknown) {
  const session = get().session;
  if (!session) return;
  if (op.method === 'POST' && /^\/session-exercises\/[^/]+\/sets$/.test(op.path)) {
    const parsed = setResultSchema.safeParse(response);
    if (!parsed.success || parsed.data.records.length === 0) return;
    const se = session.exercises.find((e) => e.id === parsed.data.set.sessionExerciseId);
    useActiveWorkout.setState({
      records: [
        ...get().records.filter((r) => r.setId !== parsed.data.set.id),
        {
          setId: parsed.data.set.id,
          exerciseName: se?.exerciseName ?? '',
          types: parsed.data.records.map((r) => r.type),
        },
      ],
    });
    return;
  }
  const parsed = sessionSchema.safeParse(response);
  if (!parsed.success || parsed.data.id !== session.id) return;
  const server = new Map(parsed.data.exercises.map((e) => [e.id, e]));
  update((s) => ({
    ...s,
    exercises: s.exercises.map((e) => {
      const fromServer = server.get(e.id);
      return fromServer && e.ghosts.length === 0 && fromServer.exerciseId === e.exerciseId
        ? { ...e, ghosts: fromServer.ghosts }
        : e;
    }),
  }));
}

if (typeof window !== 'undefined') {
  onSynced(handleSynced);
  // Outro usuário no aparelho: nada do treino anterior fica na memória.
  onOfflineUserChange(() => {
    useActiveWorkout.setState({
      session: null,
      finished: false,
      offline: false,
      extraSets: {},
      owned: false,
      rest: null,
      records: [],
    });
  });
  // Mantém `online` coerente mesmo sem a tela de treino aberta.
  useSyncStore.setState({ online: navigator.onLine });
}
