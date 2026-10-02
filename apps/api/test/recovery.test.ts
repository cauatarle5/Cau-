import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDate } from '@atlas/core';

import { as, createTestApp, onboardedUser, registerUser, type TestContext } from './helpers';

const today = localDate(new Date(), 'America/Sao_Paulo');
const yesterday = addDays(today, -1);
const MISSING = '00000000-0000-7000-8000-000000000000';

type Call = ReturnType<typeof as>;
interface Planned {
  id: string;
  date: string;
  status: string;
  templateName: string;
  weekIndex: number;
  rir: number;
  sessionId: string | null;
}
interface Adapted {
  mode: string;
  changed: boolean;
  readiness: { score: number | null; band: string; drivers: string[] };
  explanation: string[];
  exercises: {
    name: string;
    sets: number;
    originalSets: number;
    removed: boolean;
    targetRir: number | null;
  }[];
}
interface Draft {
  split: string;
  days: number;
  program: {
    name: string;
    templates: { name: string; exercises: { exerciseId: string; sets: number }[] }[];
  };
  warnings: { code: string }[];
}

const BAD_NIGHT = { sleepHours: 4, sleepQuality: 1, energy: 2, stress: 3, fatigue: 4, soreness: 3 };

async function withAgenda(call: Call) {
  // Academia seg/qua/sex, 60 min.
  await call({
    method: 'PUT',
    url: '/api/v1/availability',
    payload: { items: [1, 3, 5].map((weekday) => ({ weekday, maxMinutes: 60, kind: 'gym' })) },
  });
  const draft = (
    await call({ method: 'POST', url: '/api/v1/programs/generate', payload: {} })
  ).json<Draft>();
  const program = await call({
    method: 'POST',
    url: '/api/v1/programs',
    payload: { ...draft.program, activate: true },
  });
  return { draft, program: program.json<{ id: string; warnings: unknown[] }>() };
}

describe('periodization, recovery and adaptation', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  it('activities CRUD with sRPE load; validation and isolation', async () => {
    const a = await registerUser(ctx.app);
    const b = await registerUser(ctx.app);
    const callA = as(ctx.app, a.cookie);
    const callB = as(ctx.app, b.cookie);
    const res = await callA({
      method: 'POST',
      url: '/api/v1/activities',
      payload: {
        date: yesterday,
        sportCode: 'football',
        durationMin: 90,
        intensityRpe: 8,
        lowerBodyDemand: 3,
      },
    });
    expect(res.statusCode).toBe(201);
    // sRPE = 8 × 90 = 720 UA
    expect(res.json<{ loadAU: number }>().loadAU).toBe(720);
    const id = res.json<{ id: string }>().id;
    const patched = await callA({
      method: 'PATCH',
      url: `/api/v1/activities/${id}`,
      payload: { durationMin: 60 },
    });
    expect(patched.json<{ loadAU: number }>().loadAU).toBe(480);
    const list = await callA({
      method: 'GET',
      url: `/api/v1/activities?from=${yesterday}&to=${today}`,
    });
    expect(list.json<{ items: unknown[] }>().items).toHaveLength(1);

    const bad = await callA({
      method: 'POST',
      url: '/api/v1/activities',
      payload: {
        date: today,
        sportCode: 'football',
        durationMin: 0,
        intensityRpe: 11,
        lowerBodyDemand: 4,
      },
    });
    expect(bad.statusCode).toBe(400);
    for (const r of await Promise.all([
      callB({ method: 'PATCH', url: `/api/v1/activities/${id}`, payload: { durationMin: 10 } }),
      callB({ method: 'DELETE', url: `/api/v1/activities/${id}` }),
      callA({ method: 'DELETE', url: `/api/v1/activities/${MISSING}` }),
    ])) {
      expect(r.statusCode).toBe(404);
    }
    const listB = await callB({
      method: 'GET',
      url: `/api/v1/activities?from=${yesterday}&to=${today}`,
    });
    expect(listB.json<{ items: unknown[] }>().items).toEqual([]);
    expect((await callA({ method: 'DELETE', url: `/api/v1/activities/${id}` })).statusCode).toBe(
      204,
    );
  });

  it('check-in persists readiness (P8.5 by hand) and is per user; pain ≥ 7 asks for a professional', async () => {
    const a = await registerUser(ctx.app);
    const callA = as(ctx.app, a.cookie);
    const empty = await callA({ method: 'GET', url: `/api/v1/checkins/${today}` });
    expect(empty.json()).toEqual({
      date: today,
      checkin: null,
      readiness: { score: null, band: 'unknown', drivers: [] },
    });
    const put = await callA({
      method: 'PUT',
      url: `/api/v1/checkins/${today}`,
      payload: BAD_NIGHT,
    });
    expect(put.statusCode).toBe(200);
    // 9 + 5 + 5 + 7,5 + 7,5 = 34 → vermelho
    expect(put.json<{ readiness: { score: number; band: string } }>().readiness).toMatchObject({
      score: 34,
      band: 'red',
    });
    const row = await ctx.handle.pool.query<{ readiness_score: number }>(
      'select readiness_score from daily_checkins where user_id = $1',
      [a.user.id],
    );
    expect(row.rows[0]?.readiness_score).toBe(34);
    const invalid = await callA({
      method: 'PUT',
      url: `/api/v1/checkins/${today}`,
      payload: { ...BAD_NIGHT, energy: 6 },
    });
    expect(invalid.statusCode).toBe(400);
    const other = await registerUser(ctx.app);
    const b = await as(ctx.app, other.cookie)({ method: 'GET', url: `/api/v1/checkins/${today}` });
    expect(b.json<{ checkin: unknown }>().checkin).toBeNull();

    const pain = await callA({
      method: 'POST',
      url: '/api/v1/pain-reports',
      payload: { date: today, bodyRegion: 'knee', intensity: 7 },
    });
    expect(pain.statusCode).toBe(201);
    expect(pain.json<{ seeProfessional: boolean }>().seeProfessional).toBe(true);
  });

  it('generates a validated program, materializes the agenda and moves a workout', async () => {
    const u = await onboardedUser(ctx.app, today);
    const { draft, program } = await withAgenda(u.call);
    expect(draft.split).toBe('full_body');
    expect(draft.days).toBe(3);
    expect(draft.program.templates.map((t) => t.name)).toEqual([
      'Full body A',
      'Full body B',
      'Full body C',
    ]);
    expect(draft.program.templates[0]?.exercises).toHaveLength(6);
    expect(Array.isArray(program.warnings)).toBe(true);

    const planned = (
      await u.call({
        method: 'GET',
        url: `/api/v1/planned-workouts?from=${today}&to=${addDays(today, 13)}`,
      })
    ).json<{ items: Planned[] }>().items;
    // Seg/qua/sex em 14 dias: 6 treinos, semana 1 com RIR 3.
    expect(planned).toHaveLength(6);
    for (const p of planned)
      expect([1, 3, 5]).toContain(new Date(`${p.date}T00:00:00Z`).getUTCDay());
    expect(planned[0]).toMatchObject({ status: 'planned', weekIndex: 0, rir: 3 });

    const first = planned[0] as Planned;
    // Em dia de treino (seg/qua/sex) o primeiro já é hoje: leva para amanhã antes de trazer de volta.
    if (first.date === today)
      await u.call({
        method: 'PATCH',
        url: `/api/v1/planned-workouts/${first.id}`,
        payload: { date: addDays(today, 1) },
      });
    const moved = await u.call({
      method: 'PATCH',
      url: `/api/v1/planned-workouts/${first.id}`,
      payload: { date: today },
    });
    expect(moved.json<Planned>()).toMatchObject({ date: today, status: 'moved' });
    const skipped = await u.call({
      method: 'PATCH',
      url: `/api/v1/planned-workouts/${planned[1]?.id ?? ''}`,
      payload: { status: 'skipped' },
    });
    expect(skipped.json<Planned>().status).toBe('skipped');

    const other = await registerUser(ctx.app);
    const callB = as(ctx.app, other.cookie);
    for (const r of await Promise.all([
      callB({
        method: 'PATCH',
        url: `/api/v1/planned-workouts/${first.id}`,
        payload: { date: today },
      }),
      callB({ method: 'GET', url: `/api/v1/planned-workouts/${first.id}/adapted` }),
      callB({ method: 'POST', url: '/api/v1/sessions', payload: { plannedWorkoutId: first.id } }),
    ])) {
      expect(r.statusCode).toBe(404);
    }
  });

  it('DoD Fase 5: intense football yesterday + bad night → adapted workout with a coherent explanation', async () => {
    const u = await onboardedUser(ctx.app, today);
    await withAgenda(u.call);
    const [first] = (
      await u.call({
        method: 'GET',
        url: `/api/v1/planned-workouts?from=${today}&to=${addDays(today, 7)}`,
      })
    ).json<{ items: Planned[] }>().items;
    await u.call({
      method: 'PATCH',
      url: `/api/v1/planned-workouts/${first?.id ?? ''}`,
      payload: { date: today },
    });

    const normal = (
      await u.call({ method: 'GET', url: `/api/v1/planned-workouts/${first?.id ?? ''}/adapted` })
    ).json<Adapted>();
    expect(normal).toMatchObject({ mode: 'normal', changed: false, explanation: [] });
    expect(normal.readiness.band).toBe('unknown');

    await u.call({
      method: 'POST',
      url: '/api/v1/activities',
      payload: {
        date: yesterday,
        sportCode: 'football',
        durationMin: 90,
        intensityRpe: 8,
        lowerBodyDemand: 3,
      },
    });
    await u.call({ method: 'PUT', url: `/api/v1/checkins/${today}`, payload: BAD_NIGHT });

    const a = (
      await u.call({ method: 'GET', url: `/api/v1/planned-workouts/${first?.id ?? ''}/adapted` })
    ).json<Adapted>();
    // Full body tem pernas: 34 − 10 (futebol de alta demanda ontem) = 24 → vermelho, sessão leve.
    expect(a.readiness).toMatchObject({ score: 24, band: 'red' });
    expect(a.mode).toBe('light');
    expect(a.changed).toBe(true);
    expect(a.explanation[0]).toBe(
      'Sua prontidão hoje está em 24 (pouca disposição, fadiga alta): sessão leve, com metade das séries e 4 repetições de reserva.',
    );
    expect(a.explanation[1]).toMatch(
      /^Reduzi o volume de pernas.* porque você jogou futebol ontem com intensidade 8\.$/,
    );
    for (const e of a.exercises) {
      if (!e.removed) {
        expect(e.sets).toBeLessThan(e.originalSets);
        expect(e.targetRir).toBe(4);
      }
    }

    const start = await u.call({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { plannedWorkoutId: first?.id },
    });
    expect(start.statusCode).toBe(201);
    const session = start.json<{
      adapted: boolean;
      adaptationNote: string;
      plannedWorkoutId: string;
      exercises: { exerciseName: string; targetSets: number }[];
    }>();
    expect(session).toMatchObject({ adapted: true, plannedWorkoutId: first?.id });
    expect(session.adaptationNote).toContain('jogou futebol ontem');
    expect(session.exercises.map((e) => [e.exerciseName, e.targetSets])).toEqual(
      a.exercises.filter((e) => !e.removed).map((e) => [e.name, e.sets]),
    );
    const [after] = (
      await u.call({ method: 'GET', url: `/api/v1/planned-workouts?from=${today}&to=${today}` })
    ).json<{ items: Planned[] }>().items;
    expect(after).toMatchObject({ status: 'adapted' });
    expect(after?.sessionId).toBeTruthy();

    const load = await u.call({
      method: 'GET',
      url: `/api/v1/recovery/load?from=${yesterday}&to=${today}`,
    });
    expect(load.json<{ items: { date: string; dayAU: number }[] }>().items[0]).toMatchObject({
      date: yesterday,
      dayAU: 720,
    });
  });

  it('double progression targets: top of the range → +increment; adapted sessions do not count', async () => {
    const u = await registerUser(ctx.app);
    const call = as(ctx.app, u.cookie);
    const search = await call({
      method: 'GET',
      url: '/api/v1/exercises?q=Supino%20reto%20com%20barra',
    });
    const bench = search
      .json<{ items: { id: string; namePt: string }[] }>()
      .items.find((e) => e.namePt === 'Supino reto com barra');
    const program = (
      await call({
        method: 'POST',
        url: '/api/v1/programs',
        payload: {
          name: 'P',
          templates: [
            {
              name: 'A',
              exercises: [{ exerciseId: bench?.id, sets: 3, repMin: 8, repMax: 10, targetRir: 2 }],
            },
          ],
        },
      })
    ).json<{ templates: { id: string }[] }>();
    const templateId = program.templates[0]?.id;
    const s1 = (
      await call({
        method: 'POST',
        url: '/api/v1/sessions',
        payload: {
          workoutTemplateId: templateId,
          startedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
        },
      })
    ).json<{ id: string; exercises: { id: string; target: unknown }[] }>();
    expect(s1.exercises[0]?.target).toBeNull();
    for (const i of [0, 1, 2]) {
      await call({
        method: 'POST',
        url: `/api/v1/session-exercises/${s1.exercises[0]?.id ?? ''}/sets`,
        payload: { setIndex: i, loadKg: 80, reps: 10, rir: 2 },
      });
    }
    await call({
      method: 'PATCH',
      url: `/api/v1/sessions/${s1.id}`,
      payload: { finish: true, sessionRpe: 7 },
    });
    const s2 = (
      await call({
        method: 'POST',
        url: '/api/v1/sessions',
        payload: { workoutTemplateId: templateId },
      })
    ).json<{
      exercises: { target: { action: string; loadKg: number; repMin: number; repMax: number } }[];
    }>();
    // 3 × 10 com RIR 2 (≥ alvo − 1) → +2,5 kg e reps voltam a 8.
    expect(s2.exercises[0]?.target).toEqual({
      action: 'increase',
      loadKg: 82.5,
      repMin: 8,
      repMax: 10,
    });
  });

  it('history survives re-activation and template edits; restarting returns the same session', async () => {
    const u = await onboardedUser(ctx.app, today);
    const { program } = await withAgenda(u.call);
    const list = async (from = today, to = addDays(today, 13)) =>
      (
        await u.call({ method: 'GET', url: `/api/v1/planned-workouts?from=${from}&to=${to}` })
      ).json<{
        items: Planned[];
      }>().items;
    const [first] = await list();
    await u.call({
      method: 'PATCH',
      url: `/api/v1/planned-workouts/${first?.id ?? ''}`,
      payload: { date: today },
    });
    // Dor no joelho ≥ 4: a sessão muda (substituir), mas não é adaptação por prontidão.
    await u.call({
      method: 'POST',
      url: '/api/v1/pain-reports',
      payload: { date: today, bodyRegion: 'knee', intensity: 5 },
    });
    const start = await u.call({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { plannedWorkoutId: first?.id },
    });
    expect(start.statusCode).toBe(201);
    const session = start.json<{ id: string; adapted: boolean }>();
    expect(session.adapted).toBe(false);
    const again = await u.call({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { plannedWorkoutId: first?.id },
    });
    expect(again.statusCode).toBe(200);
    expect(again.json<{ id: string }>().id).toBe(session.id);

    const done = (await list(today, today)).find((p) => p.id === first?.id);
    expect(done).toMatchObject({ status: 'adapted', sessionId: session.id });
    const moveDone = await u.call({
      method: 'PATCH',
      url: `/api/v1/planned-workouts/${first?.id ?? ''}`,
      payload: { status: 'skipped' },
    });
    expect(moveDone.statusCode).toBe(400);

    // Reativar o programa ativo não refaz a agenda.
    await u.call({ method: 'POST', url: `/api/v1/programs/${program.id}/activate` });
    expect((await list(today, today)).find((p) => p.id === first?.id)).toMatchObject({
      status: 'adapted',
    });

    // Editar os templates do programa ativo: o feito fica (com o nome em snapshot), o futuro é refeito.
    const current = (await u.call({ method: 'GET', url: `/api/v1/programs/${program.id}` })).json<{
      templates: {
        name: string;
        exercises: { exerciseId: string; sets: number; repMin: number; repMax: number }[];
      }[];
    }>();
    const patched = await u.call({
      method: 'PATCH',
      url: `/api/v1/programs/${program.id}`,
      payload: {
        templates: current.templates.map((t) => ({
          name: `${t.name} v2`,
          exercises: t.exercises.map((e) => ({
            exerciseId: e.exerciseId,
            sets: e.sets,
            repMin: e.repMin,
            repMax: e.repMax,
          })),
        })),
      },
    });
    expect(patched.statusCode).toBe(200);
    const after = await list();
    const kept = after.find((p) => p.id === first?.id);
    expect(kept).toMatchObject({
      status: 'adapted',
      templateName: first?.templateName,
      sessionId: session.id,
    });
    const future = after.filter((p) => p.id !== first?.id);
    expect(future.length).toBeGreaterThan(0);
    for (const p of future) expect(p.templateName).toMatch(/ v2$/);

    // Apagar a sessão libera o planejado para começar de novo.
    await u.call({ method: 'DELETE', url: `/api/v1/sessions/${session.id}` });
    expect((await list()).find((p) => p.id === first?.id)).toMatchObject({
      status: 'planned',
      sessionId: null,
    });
  });

  it("pain reports only link the user's own sessions and exercises", async () => {
    const a = await registerUser(ctx.app);
    const b = await registerUser(ctx.app);
    const callA = as(ctx.app, a.cookie);
    const callB = as(ctx.app, b.cookie);
    const s = (
      await callA({ method: 'POST', url: '/api/v1/sessions', payload: { name: 'Livre' } })
    ).json<{ id: string }>();
    const own = await callA({
      method: 'POST',
      url: '/api/v1/pain-reports',
      payload: { date: today, bodyRegion: 'shoulder', intensity: 3, sessionId: s.id },
    });
    expect(own.statusCode).toBe(201);
    for (const payload of [
      { date: today, bodyRegion: 'shoulder', intensity: 3, sessionId: s.id },
      { date: today, bodyRegion: 'shoulder', intensity: 3, sessionId: MISSING },
      { date: today, bodyRegion: 'shoulder', intensity: 3, duringExerciseId: MISSING },
    ]) {
      const r = await callB({ method: 'POST', url: '/api/v1/pain-reports', payload });
      expect(r.statusCode).toBe(404);
    }
  });
});
