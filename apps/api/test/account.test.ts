import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { localDate } from '@atlas/core';
import { sql } from '@atlas/db';

import { DEMO_PASSWORD, DEMO_TZ, seedDemo } from '../src/demo/seed';
import { EXPORT_EXCLUDED } from '../src/modules/account';

import {
  as,
  createTestApp,
  registerUser,
  sessionCookie,
  uniqueEmail,
  type TestContext,
} from './helpers';

type Export = {
  format: string;
  user: Record<string, unknown>;
  tables: Record<string, Record<string, unknown>[]>;
};

describe('account (LGPD, ADR-061)', () => {
  let ctx: TestContext;
  const today = localDate(new Date(), DEMO_TZ);

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  /** Tabelas do banco com coluna `user_id` (fonte da verdade, não o schema TS). */
  async function dbUserTables(): Promise<string[]> {
    const rows = await ctx.handle.db.execute<{ table_name: string }>(sql`
      select table_name from information_schema.columns
      where table_schema = 'public' and column_name = 'user_id'
      order by table_name`);
    return rows.rows.map((r) => r.table_name);
  }

  /** Tudo o que a exclusão apaga: tabelas alcançáveis de `users` por FK `on delete cascade`. */
  async function cascadeTables(): Promise<string[]> {
    const rows = await ctx.handle.db.execute<{ name: string }>(sql`
      with recursive owned(oid) as (
        select 'public.users'::regclass::oid
        union
        select c.conrelid from pg_constraint c join owned o on c.confrelid = o.oid
        where c.contype = 'f' and c.confdeltype = 'c'
      )
      select relname as name from pg_class
      where oid in (select oid from owned) and relname <> 'users'
      order by relname`);
    return rows.rows.map((r) => r.name);
  }

  async function countsFor(userId: string) {
    const out: Record<string, number> = {};
    for (const t of await dbUserTables()) {
      const r = await ctx.handle.db.execute<{ n: number }>(
        sql`select count(*)::int as n from ${sql.identifier(t)} where user_id = ${userId}`,
      );
      out[t] = r.rows[0]?.n ?? 0;
    }
    return out;
  }

  async function demoUser() {
    const email = uniqueEmail();
    const seeded = await seedDemo(ctx.handle.db, { today, email });
    const login = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: DEMO_PASSWORD },
    });
    return { ...seeded, cookie: sessionCookie(login), call: as(ctx.app, sessionCookie(login)) };
  }

  it('requires authentication', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/account/export' });
    expect(res.statusCode).toBe(401);
  });

  it('exports every user table, only own rows, without secrets', async () => {
    const a = await demoUser();
    const b = await demoUser();
    const res = await a.call({ method: 'GET', url: '/api/v1/account/export' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="atlas-.*\.json"/);
    const data = res.json<Export>();
    expect(data.format).toBe('atlas-export-v1');
    expect(data.user.id).toBe(a.userId);
    expect(res.body).not.toContain('argon2');
    expect(res.body).not.toContain('passwordHash');

    // Tudo o que a exclusão apaga é exportado (inclusive filhas sem user_id, como itens de
    // refeição e séries), exceto a lista de exclusão.
    const expected = (await cascadeTables()).filter((t) => !EXPORT_EXCLUDED.has(t));
    expect(Object.keys(data.tables).sort()).toEqual(expected);
    for (const t of await dbUserTables())
      if (!EXPORT_EXCLUDED.has(t)) expect(expected).toContain(t);
    for (const t of EXPORT_EXCLUDED) expect(data.tables[t]).toBeUndefined();

    // Tabelas com user_id: contagens batem e nenhuma linha é de outro usuário.
    const counts = await countsFor(a.userId);
    for (const [t, rows] of Object.entries(data.tables)) {
      if (!(t in counts)) continue;
      expect(rows.length, t).toBe(counts[t]);
      for (const row of rows) expect(row.userId, t).toBe(a.userId);
    }

    // Filhas: completas e só do usuário (cadeias de 1 e 2 níveis).
    const ids = (t: string, key = 'id') =>
      new Set((data.tables[t] ?? []).map((r) => r[key] as string));
    const one = async (q: ReturnType<typeof sql>) =>
      (await ctx.handle.db.execute<{ n: number }>(q)).rows[0]?.n ?? -1;
    const items = data.tables.meal_items ?? [];
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBe(
      await one(sql`select count(*)::int as n from meal_items i join meals m on m.id = i.meal_id
                    where m.user_id = ${a.userId}`),
    );
    const meals = ids('meals');
    for (const i of items) expect(meals.has(i.mealId as string)).toBe(true);
    const sets = data.tables.set_logs ?? [];
    expect(sets.length).toBeGreaterThan(0);
    expect(sets.length).toBe(
      await one(sql`select count(*)::int as n from set_logs s
                    join session_exercises se on se.id = s.session_exercise_id
                    join workout_sessions w on w.id = se.session_id where w.user_id = ${a.userId}`),
    );
    expect(data.tables.workout_templates?.length).toBeGreaterThan(0);
    expect(data.tables.template_exercises?.length).toBeGreaterThan(0);

    const json = JSON.stringify(data.tables);
    expect(json).not.toContain(b.userId);
    const bMeal = await ctx.handle.db.execute<{ id: string }>(
      sql`select id from meals where user_id = ${b.userId} limit 1`,
    );
    expect(bMeal.rows[0]).toBeDefined();
    expect(json).not.toContain(bMeal.rows[0]?.id ?? 'x');
  });

  it('rejects a wrong password or missing confirmation and keeps the data', async () => {
    const a = await demoUser();
    const wrong = await a.call({
      method: 'DELETE',
      url: '/api/v1/account',
      payload: { password: 'senha-errada', confirmation: 'EXCLUIR' },
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json<{ code: string }>().code).toBe('INVALID_PASSWORD');
    const noConfirm = await a.call({
      method: 'DELETE',
      url: '/api/v1/account',
      payload: { password: DEMO_PASSWORD, confirmation: 'sim' },
    });
    expect(noConfirm.statusCode).toBe(400);
    expect(noConfirm.json<{ code: string }>().code).toBe('VALIDATION_ERROR');
    expect((await countsFor(a.userId)).meals).toBeGreaterThan(0);
  });

  it('deletes the account in cascade, ends the session and leaves others intact', async () => {
    const a = await demoUser();
    const b = await registerUser(ctx.app);
    const before = await countsFor(b.user.id);

    const res = await a.call({
      method: 'DELETE',
      url: '/api/v1/account',
      payload: { password: DEMO_PASSWORD, confirmation: 'EXCLUIR' },
    });
    expect(res.statusCode).toBe(204);
    expect(res.cookies.find((c) => c.name === 'atlas_session')?.value).toBe('');

    const left = await countsFor(a.userId);
    expect(Object.entries(left).filter(([, n]) => n > 0)).toEqual([]);
    const users = await ctx.handle.db.execute<{ n: number }>(
      sql`select count(*)::int as n from users where id = ${a.userId}`,
    );
    expect(users.rows[0]?.n).toBe(0);

    const me = await a.call({ method: 'GET', url: '/api/v1/auth/me' });
    expect(me.statusCode).toBe(401);
    expect(await countsFor(b.user.id)).toEqual(before);
    const meB = await as(ctx.app, b.cookie)({ method: 'GET', url: '/api/v1/auth/me' });
    expect(meB.statusCode).toBe(200);
  });
});
