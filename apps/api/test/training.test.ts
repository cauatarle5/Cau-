import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';

import { weekStart } from '@atlas/core';

import { as, createTestApp, registerUser, type TestContext } from './helpers';

const MISSING = '00000000-0000-7000-8000-000000000000';

interface Exercise {
  id: string;
  namePt: string;
  equipmentCodes: string[];
  primaryMuscles: string[];
  preference: string | null;
  isCustom: boolean;
}
interface SetResult {
  set: { id: string; setIndex: number; loadKg: number; reps: number };
  records: { type: string; value: number }[];
}
interface Session {
  id: string;
  date: string;
  name: string;
  source: string;
  durationMin: number | null;
  sessionRpe: number | null;
  tonnage: number;
  hardSets: number;
  records: { type: string; exerciseName: string; value: number }[];
  exercises: {
    id: string;
    exerciseId: string;
    exerciseName: string;
    status: string;
    skipReason: string | null;
    substitutedFromExerciseId: string | null;
    targetSets: number | null;
    repMin: number | null;
    ghosts: { setIndex: number; loadKg: number | null; reps: number | null }[];
    sets: { id: string }[];
  }[];
}
interface Program {
  id: string;
  status: string;
  templates: { id: string; name: string; exercises: { exerciseName: string; sets: number }[] }[];
}

type Call = ReturnType<typeof as>;

async function findExercise(call: Call, q: string): Promise<Exercise> {
  const res = await call({ method: 'GET', url: `/api/v1/exercises?q=${encodeURIComponent(q)}` });
  const items = res.json<{ items: Exercise[] }>().items;
  const hit = items.find((e) => e.namePt === q);
  if (!hit) throw new Error(`exercise not found: ${q}`);
  return hit;
}

function programPayload(ids: { bench: string; row: string; squat: string }, activate = true) {
  return {
    name: 'Superior / Inferior',
    activate,
    templates: [
      {
        name: 'Superior A',
        exercises: [
          { exerciseId: ids.bench, sets: 3, repMin: 6, repMax: 10, targetRir: 2, restSeconds: 150 },
          { exerciseId: ids.row, sets: 3, repMin: 8, repMax: 12 },
        ],
      },
      {
        name: 'Inferior A',
        exercises: [{ exerciseId: ids.squat, sets: 3, repMin: 5, repMax: 8 }],
      },
    ],
  };
}

describe('training', () => {
  let ctx: TestContext;
  let a: Awaited<ReturnType<typeof registerUser>> & { call: Call };
  let b: Awaited<ReturnType<typeof registerUser>> & { call: Call };
  let ids: { bench: string; row: string; squat: string; dbBench: string; dips: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    const ua = await registerUser(ctx.app);
    const ub = await registerUser(ctx.app);
    a = { ...ua, call: as(ctx.app, ua.cookie) };
    b = { ...ub, call: as(ctx.app, ub.cookie) };
    ids = {
      bench: (await findExercise(a.call, 'Supino reto com barra')).id,
      row: (await findExercise(a.call, 'Remada curvada com barra')).id,
      squat: (await findExercise(a.call, 'Agachamento livre')).id,
      dbBench: (await findExercise(a.call, 'Supino reto com halteres')).id,
      dips: (await findExercise(a.call, 'Mergulho nas paralelas')).id,
    };
  });
  afterAll(() => ctx.close());

  describe('exercises', () => {
    it('searches by name/alias and filters by muscle, equipment and pattern', async () => {
      const q = await a.call({ method: 'GET', url: '/api/v1/exercises?q=supino' });
      expect(q.statusCode).toBe(200);
      const items = q.json<{ items: Exercise[] }>().items;
      expect(items.length).toBeGreaterThan(3);
      expect(items[0]?.namePt).toMatch(/^Supino/);

      const alias = await a.call({ method: 'GET', url: '/api/v1/exercises?q=peck%20deck' });
      expect(alias.json<{ items: Exercise[] }>().items[0]?.namePt).toBe('Crucifixo na máquina');

      const filtered = await a.call({
        method: 'GET',
        url: '/api/v1/exercises?muscle=biceps&equipment=dumbbell&pattern=isolation_upper',
      });
      const list = filtered.json<{ items: Exercise[] }>().items;
      expect(list.length).toBeGreaterThan(0);
      for (const e of list) expect(e.equipmentCodes).toContain('dumbbell');
      expect(list.map((e) => e.namePt)).toContain('Rosca martelo');

      const bad = await a.call({ method: 'GET', url: '/api/v1/exercises?muscle=wings' });
      expect(bad.statusCode).toBe(400);
      const missing = await a.call({ method: 'GET', url: `/api/v1/exercises/${MISSING}` });
      expect(missing.statusCode).toBe(404);
    });

    it('custom exercise is visible only to its owner', async () => {
      const res = await a.call({
        method: 'POST',
        url: '/api/v1/exercises',
        payload: {
          namePt: 'Supino no banco caseiro',
          movementPattern: 'horizontal_push',
          mechanics: 'compound',
          equipmentCodes: ['dumbbell'],
          primaryMuscles: ['chest'],
          secondaryMuscles: ['triceps'],
        },
      });
      expect(res.statusCode).toBe(201);
      const ex = res.json<Exercise>();
      expect(ex.isCustom).toBe(true);

      expect((await b.call({ method: 'GET', url: `/api/v1/exercises/${ex.id}` })).statusCode).toBe(
        404,
      );
      const bSearch = await b.call({ method: 'GET', url: '/api/v1/exercises?q=banco%20caseiro' });
      expect(bSearch.json<{ items: Exercise[] }>().items.map((e) => e.id)).not.toContain(ex.id);

      const invalid = await a.call({
        method: 'POST',
        url: '/api/v1/exercises',
        payload: {
          namePt: 'X',
          movementPattern: 'core',
          mechanics: 'isolation',
          primaryMuscles: [],
        },
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json<{ code: string }>().code).toBe('VALIDATION_ERROR');
    });

    it('preferences are stored per user and shape alternatives', async () => {
      const u = await registerUser(ctx.app);
      const call = as(ctx.app, u.cookie);
      // Só halteres e banco: nada de barra nem paralelas; ombro contraindica extensão.
      await call({
        method: 'PUT',
        url: '/api/v1/equipment',
        payload: {
          items: [
            { equipmentCode: 'dumbbell', location: 'gym' },
            { equipmentCode: 'bench', location: 'gym' },
            { equipmentCode: 'cable', location: 'gym' },
          ],
        },
      });
      await call({
        method: 'POST',
        url: '/api/v1/limitations',
        payload: {
          bodyRegion: 'Ombro',
          severity: 2,
          contraindicatedPatterns: ['shoulder_extension'],
        },
      });
      const incline = await findExercise(call, 'Supino inclinado com halteres');
      const fly = await findExercise(call, 'Crucifixo com halteres');
      const put = await call({
        method: 'PUT',
        url: '/api/v1/exercise-preferences',
        payload: {
          items: [
            { exerciseId: incline.id, preference: 'like' },
            { exerciseId: ids.dbBench, preference: 'avoid' },
            { exerciseId: fly.id, preference: 'neutral' },
          ],
        },
      });
      expect(put.statusCode).toBe(200);
      expect(put.json<{ items: unknown[] }>().items).toHaveLength(2);

      const got = await call({ method: 'GET', url: '/api/v1/exercise-preferences' });
      expect(got.json<{ items: { exerciseId: string; preference: string }[] }>().items).toEqual(
        expect.arrayContaining([
          { exerciseId: incline.id, preference: 'like' },
          { exerciseId: ids.dbBench, preference: 'avoid' },
        ]),
      );
      expect(
        (await b.call({ method: 'GET', url: '/api/v1/exercise-preferences' })).json<{
          items: unknown[];
        }>().items,
      ).toHaveLength(0);

      const alt = await call({ method: 'GET', url: `/api/v1/exercises/${ids.bench}/alternatives` });
      expect(alt.statusCode).toBe(200);
      const alts = alt.json<{ items: Exercise[] }>().items;
      expect(alts[0]?.id).toBe(incline.id);
      const altIds = alts.map((e) => e.id);
      expect(altIds).not.toContain(ids.dbBench);
      expect(altIds).not.toContain(ids.dips);
      for (const e of alts) {
        for (const eq of e.equipmentCodes) {
          expect(['dumbbell', 'bench', 'cable', 'bodyweight']).toContain(eq);
        }
      }

      const unknown = await call({
        method: 'PUT',
        url: '/api/v1/exercise-preferences',
        payload: { items: [{ exerciseId: MISSING, preference: 'like' }] },
      });
      expect(unknown.statusCode).toBe(400);
    });
  });

  describe('programs', () => {
    it('creates, lists, edits and activates with one active program per user', async () => {
      const first = await a.call({
        method: 'POST',
        url: '/api/v1/programs',
        payload: programPayload(ids),
      });
      expect(first.statusCode).toBe(201);
      const p1 = first.json<Program>();
      expect(p1.status).toBe('active');
      expect(p1.templates.map((t) => t.name)).toEqual(['Superior A', 'Inferior A']);
      expect(p1.templates[0]?.exercises.map((e) => e.exerciseName)).toEqual([
        'Supino reto com barra',
        'Remada curvada com barra',
      ]);

      const second = await a.call({
        method: 'POST',
        url: '/api/v1/programs',
        payload: { ...programPayload(ids), name: 'Outro' },
      });
      const p2 = second.json<Program>();
      expect(p2.status).toBe('active');
      const again = await a.call({ method: 'GET', url: `/api/v1/programs/${p1.id}` });
      expect(again.json<Program>().status).toBe('archived');

      const activated = await a.call({ method: 'POST', url: `/api/v1/programs/${p1.id}/activate` });
      expect(activated.json<Program>().status).toBe('active');
      const list = await a.call({ method: 'GET', url: '/api/v1/programs' });
      const statuses = list.json<{ items: Program[] }>().items.map((p) => p.status);
      expect(statuses.filter((s) => s === 'active')).toHaveLength(1);

      const patched = await a.call({
        method: 'PATCH',
        url: `/api/v1/programs/${p2.id}`,
        payload: {
          name: 'Full body',
          templates: [
            { name: 'Full', exercises: [{ exerciseId: ids.squat, sets: 4, repMin: 5, repMax: 5 }] },
          ],
        },
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.json<Program>().templates).toHaveLength(1);
      expect(patched.json<Program>().templates[0]?.exercises[0]?.sets).toBe(4);
    });

    it('validates input and isolates users', async () => {
      const bad = await a.call({
        method: 'POST',
        url: '/api/v1/programs',
        payload: {
          name: 'Ruim',
          templates: [
            { name: 'A', exercises: [{ exerciseId: ids.bench, sets: 3, repMin: 12, repMax: 8 }] },
          ],
        },
      });
      expect(bad.statusCode).toBe(400);
      const unknown = await a.call({
        method: 'POST',
        url: '/api/v1/programs',
        payload: {
          name: 'Ruim',
          templates: [
            { name: 'A', exercises: [{ exerciseId: MISSING, sets: 3, repMin: 8, repMax: 12 }] },
          ],
        },
      });
      expect(unknown.statusCode).toBe(400);
      expect(unknown.json<{ errors: { field: string }[] }>().errors[0]?.field).toBe(
        'templates.0.exercises.0.exerciseId',
      );

      const mine = await a.call({
        method: 'POST',
        url: '/api/v1/programs',
        payload: programPayload(ids, false),
      });
      const id = mine.json<Program>().id;
      expect((await b.call({ method: 'GET', url: `/api/v1/programs/${id}` })).statusCode).toBe(404);
      expect(
        (await b.call({ method: 'PATCH', url: `/api/v1/programs/${id}`, payload: { name: 'x' } }))
          .statusCode,
      ).toBe(404);
      expect(
        (await b.call({ method: 'POST', url: `/api/v1/programs/${id}/activate` })).statusCode,
      ).toBe(404);
      expect((await b.call({ method: 'GET', url: `/api/v1/programs/${MISSING}` })).statusCode).toBe(
        404,
      );
    });

    it('Idempotency-Key replays the stored response and rejects reuse on another route', async () => {
      const key = uuidv7();
      const headers = { 'idempotency-key': key };
      const r1 = await a.call({
        method: 'POST',
        url: '/api/v1/programs',
        payload: programPayload(ids, false),
        headers,
      });
      const r2 = await a.call({
        method: 'POST',
        url: '/api/v1/programs',
        payload: programPayload(ids, false),
        headers,
      });
      expect(r1.statusCode).toBe(201);
      expect(r2.statusCode).toBe(201);
      expect(r2.headers['idempotent-replayed']).toBe('true');
      expect(r2.json<Program>().id).toBe(r1.json<Program>().id);

      const reused = await a.call({
        method: 'POST',
        url: '/api/v1/sessions',
        payload: { name: 'Livre' },
        headers,
      });
      expect(reused.statusCode).toBe(422);
      expect(reused.json<{ code: string }>().code).toBe('IDEMPOTENCY_KEY_REUSED');

      // Chaves são por usuário.
      const other = await b.call({
        method: 'POST',
        url: '/api/v1/programs',
        payload: programPayload(ids, false),
        headers,
      });
      expect(other.statusCode).toBe(201);
      expect(other.json<Program>().id).not.toBe(r1.json<Program>().id);
    });
  });

  describe('sessions', () => {
    it('full workout: ghosts, idempotent client ids, records, finish, history, progress and volume', async () => {
      const u = await registerUser(ctx.app);
      const call = as(ctx.app, u.cookie);
      const program = (
        await call({ method: 'POST', url: '/api/v1/programs', payload: programPayload(ids) })
      ).json<Program>();
      const templateId = program.templates[0]?.id;

      // 1ª sessão (referência: sem recordes).
      const s1Id = uuidv7();
      const start = new Date(Date.now() - 50 * 60000).toISOString();
      const started = await call({
        method: 'POST',
        url: '/api/v1/sessions',
        payload: { id: s1Id, workoutTemplateId: templateId, startedAt: start },
      });
      expect(started.statusCode).toBe(201);
      const s1 = started.json<Session>();
      expect(s1.id).toBe(s1Id);
      expect(s1.name).toBe('Superior A');
      expect(s1.exercises.map((e) => [e.exerciseName, e.targetSets, e.repMin])).toEqual([
        ['Supino reto com barra', 3, 6],
        ['Remada curvada com barra', 3, 8],
      ]);
      expect(s1.exercises[0]?.ghosts).toEqual([
        { setIndex: 0, loadKg: null, reps: null, rir: null },
        { setIndex: 1, loadKg: null, reps: null, rir: null },
        { setIndex: 2, loadKg: null, reps: null, rir: null },
      ]);

      const retry = await call({
        method: 'POST',
        url: '/api/v1/sessions',
        payload: { id: s1Id, workoutTemplateId: templateId, startedAt: start },
      });
      expect(retry.statusCode).toBe(200);
      expect(retry.json<Session>().exercises).toHaveLength(2);

      const bench1 = s1.exercises[0]?.id ?? '';
      const row1 = s1.exercises[1]?.id ?? '';
      const setIds: string[] = [];
      for (const [i, load, reps] of [
        [0, 80, 8],
        [1, 80, 8],
        [2, 80, 7],
      ] as const) {
        const id = uuidv7();
        setIds.push(id);
        const res = await call({
          method: 'POST',
          url: `/api/v1/session-exercises/${bench1}/sets`,
          payload: { id, setIndex: i, loadKg: load, reps },
        });
        expect(res.statusCode).toBe(201);
        expect(res.json<SetResult>().records).toEqual([]);
      }
      // Reenvio da fila offline: mesma série, sem duplicar.
      const dup = await call({
        method: 'POST',
        url: `/api/v1/session-exercises/${bench1}/sets`,
        payload: { id: setIds[0], setIndex: 0, loadKg: 80, reps: 8 },
      });
      expect(dup.statusCode).toBe(200);
      expect(dup.json<SetResult>().set.id).toBe(setIds[0]);

      const skip = await call({
        method: 'PATCH',
        url: `/api/v1/session-exercises/${row1}`,
        payload: { status: 'skipped', skipReason: 'Aparelho ocupado' },
      });
      expect(skip.statusCode).toBe(200);
      expect(skip.json<Session>().exercises[1]).toMatchObject({
        status: 'skipped',
        skipReason: 'Aparelho ocupado',
      });

      const finished = await call({
        method: 'PATCH',
        url: `/api/v1/sessions/${s1Id}`,
        payload: { finish: true, sessionRpe: 8, source: 'offline_sync' },
      });
      expect(finished.statusCode).toBe(200);
      const f1 = finished.json<Session>();
      expect(f1.sessionRpe).toBe(8);
      expect(f1.source).toBe('offline_sync');
      expect(f1.durationMin).toBeGreaterThanOrEqual(49);
      expect(f1.exercises.map((e) => e.status)).toEqual(['done', 'skipped']);
      // 80×8 + 80×8 + 80×7 = 1840 kg; 3 séries duras (sem RIR).
      expect(f1.tonnage).toBe(1840);
      expect(f1.hardSets).toBe(3);
      expect(f1.records).toEqual([]);

      // 2ª sessão: fantasmas = última sessão; recordes ao superar.
      const s2 = (
        await call({
          method: 'POST',
          url: '/api/v1/sessions',
          payload: { workoutTemplateId: templateId },
        })
      ).json<Session>();
      expect(s2.exercises[0]?.ghosts.map((g) => [g.loadKg, g.reps])).toEqual([
        [80, 8],
        [80, 8],
        [80, 7],
      ]);
      const bench2 = s2.exercises[0]?.id ?? '';
      const pr = await call({
        method: 'POST',
        url: `/api/v1/session-exercises/${bench2}/sets`,
        payload: { id: uuidv7(), setIndex: 0, loadKg: 85, reps: 8, rir: 1 },
      });
      expect(pr.statusCode).toBe(201);
      const hits = pr.json<SetResult>().records;
      // e1RM: 85 × (1 + 9/30) = 110,5 > 80 × (1 + 8/30) = 101,33
      expect(hits.map((h) => h.type).sort()).toEqual(['e1rm', 'max_load']);
      expect(hits.find((h) => h.type === 'e1rm')?.value).toBeCloseTo(110.5, 6);

      const same = await call({
        method: 'POST',
        url: `/api/v1/session-exercises/${bench2}/sets`,
        payload: { id: uuidv7(), setIndex: 1, loadKg: 85, reps: 8, rir: 1 },
      });
      expect(same.json<SetResult>().records).toEqual([]);
      const more = await call({
        method: 'POST',
        url: `/api/v1/session-exercises/${bench2}/sets`,
        payload: { id: uuidv7(), setIndex: 2, loadKg: 85, reps: 9 },
      });
      // 85 × (1 + 9/30) = 110,5: empata com 85×8 RIR 1, então só reps na carga.
      expect(more.json<SetResult>().records.map((h) => h.type)).toEqual(['rep_at_load']);

      const f2 = (
        await call({ method: 'PATCH', url: `/api/v1/sessions/${s2.id}`, payload: { finish: true } })
      ).json<Session>();
      // 85×8 + 85×8 + 85×9 = 2125 > 1840 → recorde de tonelagem.
      expect(f2.tonnage).toBe(2125);
      expect(f2.records.map((r) => r.type)).toContain('volume_session');
      expect(f2.records.every((r) => r.exerciseName === 'Supino reto com barra')).toBe(true);
      // Finalizar de novo não duplica recordes.
      const f2b = (
        await call({ method: 'PATCH', url: `/api/v1/sessions/${s2.id}`, payload: { finish: true } })
      ).json<Session>();
      expect(f2b.records).toHaveLength(f2.records.length);

      const list = await call({ method: 'GET', url: '/api/v1/sessions' });
      const summaries = list.json<{
        items: { id: string; tonnage: number; setCount: number; recordCount: number }[];
      }>().items;
      expect(summaries.map((s) => s.id)).toEqual([s2.id, s1Id]);
      expect(summaries[1]).toMatchObject({ tonnage: 1840, setCount: 3, recordCount: 0 });

      const progress = await call({
        method: 'GET',
        url: `/api/v1/exercises/${ids.bench}/progress`,
      });
      expect(progress.statusCode).toBe(200);
      const prog = progress.json<{
        points: { sessionId: string; bestE1rm: number; topLoadKg: number; tonnage: number }[];
        records: { type: string }[];
      }>();
      expect(prog.points.map((p) => [p.sessionId, p.topLoadKg, p.tonnage])).toEqual([
        [s1Id, 80, 1840],
        [s2.id, 85, 2125],
      ]);
      // 85 × (1 + 9/30) = 110,5 (8 reps + RIR 1) = 85 × 1,3 (9 reps sem RIR)
      expect(prog.points[1]?.bestE1rm).toBeCloseTo(110.5, 6);
      expect(prog.records.length).toBeGreaterThanOrEqual(4);

      const vol = await call({
        method: 'GET',
        url: `/api/v1/analytics/muscle-volume?weekStart=${s2.date}`,
      });
      expect(vol.statusCode).toBe(200);
      const volume = vol.json<{
        weekStart: string;
        items: {
          muscle: string;
          hardSets: number;
          frequency: number;
          status: string;
          alert: boolean;
        }[];
      }>();
      expect(volume.weekStart).toBe(weekStart(s2.date));
      expect(volume.items).toHaveLength(19);
      const sameWeek = weekStart(s1.date) === weekStart(s2.date);
      const chest = volume.items.find((i) => i.muscle === 'chest');
      const triceps = volume.items.find((i) => i.muscle === 'triceps');
      // Supino: peito 1,0 e tríceps 0,5 por série dura.
      expect(chest?.hardSets).toBe(sameWeek ? 6 : 3);
      expect(triceps?.hardSets).toBe(sameWeek ? 3 : 1.5);
      expect(chest).toMatchObject({ status: 'below_mev', alert: true });
      expect(volume.items.find((i) => i.muscle === 'calves')).toMatchObject({
        hardSets: 0,
        alert: false,
      });
    });

    it('substitutes only before logging sets; adds exercises; edits and deletes sets', async () => {
      const start = await a.call({
        method: 'POST',
        url: '/api/v1/sessions',
        payload: { name: 'Livre' },
      });
      expect(start.statusCode).toBe(201);
      const s = start.json<Session>();
      expect(s.exercises).toHaveLength(0);

      const seId = uuidv7();
      const added = await a.call({
        method: 'POST',
        url: `/api/v1/sessions/${s.id}/exercises`,
        payload: { id: seId, exerciseId: ids.bench },
      });
      expect(added.statusCode).toBe(201);
      const addedAgain = await a.call({
        method: 'POST',
        url: `/api/v1/sessions/${s.id}/exercises`,
        payload: { id: seId, exerciseId: ids.bench },
      });
      expect(addedAgain.statusCode).toBe(200);
      expect(addedAgain.json<Session>().exercises).toHaveLength(1);

      const sub = await a.call({
        method: 'PATCH',
        url: `/api/v1/session-exercises/${seId}`,
        payload: { substituteExerciseId: ids.dbBench },
      });
      expect(sub.statusCode).toBe(200);
      expect(sub.json<Session>().exercises[0]).toMatchObject({
        exerciseId: ids.dbBench,
        exerciseName: 'Supino reto com halteres',
        substitutedFromExerciseId: ids.bench,
        status: 'substituted',
      });

      const set = await a.call({
        method: 'POST',
        url: `/api/v1/session-exercises/${seId}/sets`,
        payload: { setIndex: 0, loadKg: 30, reps: 10 },
      });
      const setId = set.json<SetResult>().set.id;
      const late = await a.call({
        method: 'PATCH',
        url: `/api/v1/session-exercises/${seId}`,
        payload: { substituteExerciseId: ids.bench },
      });
      expect(late.statusCode).toBe(400);

      const edited = await a.call({
        method: 'PATCH',
        url: `/api/v1/sets/${setId}`,
        payload: { loadKg: 32.5 },
      });
      expect(edited.statusCode).toBe(200);
      expect(edited.json<SetResult>().set.loadKg).toBe(32.5);
      expect((await a.call({ method: 'DELETE', url: `/api/v1/sets/${setId}` })).statusCode).toBe(
        204,
      );
      expect((await a.call({ method: 'DELETE', url: `/api/v1/sets/${setId}` })).statusCode).toBe(
        404,
      );

      expect((await a.call({ method: 'DELETE', url: `/api/v1/sessions/${s.id}` })).statusCode).toBe(
        204,
      );
      expect((await a.call({ method: 'GET', url: `/api/v1/sessions/${s.id}` })).statusCode).toBe(
        404,
      );
    });

    it('validates input and returns 404 for unknown ids', async () => {
      const none = await a.call({ method: 'POST', url: '/api/v1/sessions', payload: {} });
      expect(none.statusCode).toBe(400);
      const tpl = await a.call({
        method: 'POST',
        url: '/api/v1/sessions',
        payload: { workoutTemplateId: MISSING },
      });
      expect(tpl.statusCode).toBe(404);

      const s = (
        await a.call({ method: 'POST', url: '/api/v1/sessions', payload: { name: 'Teste' } })
      ).json<Session>();
      const se = (
        await a.call({
          method: 'POST',
          url: `/api/v1/sessions/${s.id}/exercises`,
          payload: { exerciseId: ids.squat },
        })
      ).json<Session>().exercises[0]?.id;
      const tooMany = await a.call({
        method: 'POST',
        url: `/api/v1/session-exercises/${se ?? ''}/sets`,
        payload: { setIndex: 0, reps: 101, loadKg: 100 },
      });
      expect(tooMany.statusCode).toBe(400);
      const heavy = await a.call({
        method: 'POST',
        url: `/api/v1/session-exercises/${se ?? ''}/sets`,
        payload: { setIndex: 0, reps: 5, loadKg: 1001 },
      });
      expect(heavy.statusCode).toBe(400);
      const early = await a.call({
        method: 'PATCH',
        url: `/api/v1/sessions/${s.id}`,
        payload: { endedAt: '2000-01-01T00:00:00Z' },
      });
      expect(early.statusCode).toBe(400);
      expect((await a.call({ method: 'GET', url: `/api/v1/sessions/${MISSING}` })).statusCode).toBe(
        404,
      );
      expect(
        (
          await a.call({
            method: 'POST',
            url: `/api/v1/session-exercises/${MISSING}/sets`,
            payload: { setIndex: 0 },
          })
        ).statusCode,
      ).toBe(404);
      const unknownEx = await a.call({
        method: 'POST',
        url: `/api/v1/sessions/${s.id}/exercises`,
        payload: { exerciseId: MISSING },
      });
      expect(unknownEx.statusCode).toBe(400);
    });

    it('isolates sessions, exercises and sets between users', async () => {
      const s = (
        await a.call({ method: 'POST', url: '/api/v1/sessions', payload: { name: 'Privado' } })
      ).json<Session>();
      const se =
        (
          await a.call({
            method: 'POST',
            url: `/api/v1/sessions/${s.id}/exercises`,
            payload: { exerciseId: ids.bench },
          })
        ).json<Session>().exercises[0]?.id ?? '';
      const setId = (
        await a.call({
          method: 'POST',
          url: `/api/v1/session-exercises/${se}/sets`,
          payload: { setIndex: 0, loadKg: 60, reps: 10 },
        })
      ).json<SetResult>().set.id;

      const bCalls = [
        b.call({ method: 'GET', url: `/api/v1/sessions/${s.id}` }),
        b.call({ method: 'PATCH', url: `/api/v1/sessions/${s.id}`, payload: { finish: true } }),
        b.call({ method: 'DELETE', url: `/api/v1/sessions/${s.id}` }),
        b.call({
          method: 'POST',
          url: `/api/v1/sessions/${s.id}/exercises`,
          payload: { exerciseId: ids.bench },
        }),
        b.call({
          method: 'PATCH',
          url: `/api/v1/session-exercises/${se}`,
          payload: { status: 'skipped' },
        }),
        b.call({
          method: 'POST',
          url: `/api/v1/session-exercises/${se}/sets`,
          payload: { setIndex: 1, loadKg: 60, reps: 10 },
        }),
        b.call({ method: 'PATCH', url: `/api/v1/sets/${setId}`, payload: { reps: 1 } }),
        b.call({ method: 'DELETE', url: `/api/v1/sets/${setId}` }),
      ];
      for (const res of await Promise.all(bCalls)) expect(res.statusCode).toBe(404);

      // Id de série de A reenviado por B não sobrescreve nem vaza.
      const stolen = await b.call({
        method: 'POST',
        url: '/api/v1/sessions',
        payload: { id: s.id, name: 'Invasor' },
      });
      expect(stolen.statusCode).toBe(409);

      const bList = await b.call({ method: 'GET', url: '/api/v1/sessions' });
      expect(bList.json<{ items: { id: string }[] }>().items.map((x) => x.id)).not.toContain(s.id);
      const still = await a.call({ method: 'GET', url: `/api/v1/sessions/${s.id}` });
      expect(still.json<Session>().exercises[0]?.sets).toHaveLength(1);

      expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/sessions' })).statusCode).toBe(
        401,
      );
    });
  });
});
