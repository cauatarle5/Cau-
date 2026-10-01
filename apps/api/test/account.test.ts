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

    // Nenhuma tabela com user_id fica fora da exportação sem estar na lista de exclusão.
    const expected = (await dbUserTables()).filter((t) => !EXPORT_EXCLUDED.has(t));
    expect(Object.keys(data.tables).sort()).toEqual(expected);
    for (const t of EXPORT_EXCLUDED) expect(data.tables[t]).toBeUndefined();

    // Contagens batem com o banco e nenhuma linha é de outro usuário.
    const counts = await countsFor(a.userId);
    for (const [t, rows] of Object.entries(data.tables)) {
      expect(rows.length, t).toBe(counts[t]);
      for (const row of rows) expect(row.userId, t).toBe(a.userId);
    }
    expect(data.tables.meals?.length).toBeGreaterThan(0);
    expect(data.tables.workout_sessions?.length).toBeGreaterThan(0);
    expect(JSON.stringify(data.tables)).not.toContain(b.userId);
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
