import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { eq, sessions, users } from '@atlas/db';

import { hashSessionToken } from '../src/modules/auth/index.js';

import {
  createTestApp,
  registerUser,
  sessionCookie,
  uniqueEmail,
  WEB_ORIGIN,
  type TestContext,
} from './helpers.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('auth', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  describe('POST /auth/register', () => {
    it('creates the user, returns public data and sets a secure-by-default cookie', async () => {
      const email = uniqueEmail();
      const { res, user } = await registerUser(ctx.app, {
        email: email.toUpperCase(),
        name: ' Ana ',
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({
        user: {
          id: user.id,
          email,
          name: 'Ana',
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
        },
      });
      expect(res.body).not.toContain('password');

      const cookie = res.cookies.find((c) => c.name === 'atlas_session');
      expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
      expect(cookie?.expires && cookie.expires.getTime() - Date.now()).toBeGreaterThan(29 * DAY_MS);

      const [stored] = await ctx.handle.db.select().from(users).where(eq(users.id, user.id));
      expect(stored?.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    });

    it('stores only the SHA-256 hash of the session token', async () => {
      const { res, user } = await registerUser(ctx.app);
      const token = res.cookies.find((c) => c.name === 'atlas_session')?.value ?? '';
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);

      const rows = await ctx.handle.db.select().from(sessions).where(eq(sessions.userId, user.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.tokenHash).toBe(hashSessionToken(token));
      expect(rows[0]?.tokenHash).not.toBe(token);
    });

    it('rejects invalid input with field errors', async () => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { name: '', email: 'not-an-email', password: 'short' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json<{ code: string; errors: { field: string }[] }>();
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.errors.map((e) => e.field).sort()).toEqual(['email', 'name', 'password']);
    });

    it('rejects a duplicate e-mail case-insensitively', async () => {
      const email = uniqueEmail();
      await registerUser(ctx.app, { email });
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { name: 'Outro', email: email.toUpperCase(), password: 'outra-senha-123' },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: 'EMAIL_TAKEN' });
    });

    it('rejects write requests from a foreign Origin', async () => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        headers: { origin: 'https://evil.example' },
        payload: { name: 'X', email: uniqueEmail(), password: 'senha-segura-123' },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: 'ORIGIN_FORBIDDEN' });
    });

    it('accepts write requests from the web origin', async () => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        headers: { origin: WEB_ORIGIN },
        payload: { name: 'X', email: uniqueEmail(), password: 'senha-segura-123' },
      });
      expect(res.statusCode).toBe(201);
    });
  });

  describe('POST /auth/login', () => {
    it('logs in with correct credentials (e-mail case-insensitive)', async () => {
      const { payload, user } = await registerUser(ctx.app);
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: payload.email.toUpperCase(), password: payload.password },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ user: { id: user.id } });
      expect(() => sessionCookie(res)).not.toThrow();
    });

    it('returns the same error for wrong password and unknown e-mail', async () => {
      const { payload } = await registerUser(ctx.app);
      const wrong = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: payload.email, password: 'senha-errada-000' },
      });
      const unknown = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: uniqueEmail(), password: 'senha-errada-000' },
      });
      for (const res of [wrong, unknown]) {
        expect(res.statusCode).toBe(401);
        expect(res.json()).toMatchObject({ code: 'INVALID_CREDENTIALS' });
        expect(res.cookies.find((c) => c.name === 'atlas_session')).toBeUndefined();
      }
    });

    it('rejects invalid input', async () => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'x' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });

  describe('GET /auth/me', () => {
    it('returns the authenticated user', async () => {
      const { cookie, user } = await registerUser(ctx.app);
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ user: { id: user.id } });
    });

    it('returns 401 without cookie or with an unknown token', async () => {
      const none = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me' });
      const bogus = await ctx.app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { cookie: 'atlas_session=bogus' },
      });
      for (const res of [none, bogus]) {
        expect(res.statusCode).toBe(401);
        expect(res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
      }
    });

    it('returns 401 for an expired session', async () => {
      const { cookie, user } = await registerUser(ctx.app);
      await ctx.handle.db
        .update(sessions)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(sessions.userId, user.id));
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { cookie },
      });
      expect(res.statusCode).toBe(401);
    });

    it('renews a session close to expiry (sliding) and leaves fresh ones alone', async () => {
      const { cookie, user } = await registerUser(ctx.app);

      const fresh = await ctx.app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { cookie },
      });
      expect(fresh.cookies.find((c) => c.name === 'atlas_session')).toBeUndefined();

      await ctx.handle.db
        .update(sessions)
        .set({ expiresAt: new Date(Date.now() + 10 * DAY_MS) })
        .where(eq(sessions.userId, user.id));
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const renewed = res.cookies.find((c) => c.name === 'atlas_session');
      expect(renewed?.expires && renewed.expires.getTime() - Date.now()).toBeGreaterThan(
        29 * DAY_MS,
      );

      const [row] = await ctx.handle.db.select().from(sessions).where(eq(sessions.userId, user.id));
      expect(row && row.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * DAY_MS);
    });
  });

  describe('POST /auth/logout', () => {
    it('invalidates the session and clears the cookie', async () => {
      const { cookie, user } = await registerUser(ctx.app);
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { cookie },
      });
      expect(res.statusCode).toBe(204);
      const cleared = res.cookies.find((c) => c.name === 'atlas_session');
      expect(cleared?.value).toBe('');

      const rows = await ctx.handle.db.select().from(sessions).where(eq(sessions.userId, user.id));
      expect(rows).toHaveLength(0);
      const me = await ctx.app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { cookie },
      });
      expect(me.statusCode).toBe(401);
    });

    it('is idempotent without a session', async () => {
      const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/logout' });
      expect(res.statusCode).toBe(204);
    });
  });

  describe('isolation between users', () => {
    it("each session only ever resolves to its own user, and logout only affects the caller's session", async () => {
      const a = await registerUser(ctx.app);
      const b = await registerUser(ctx.app);

      const meA = await ctx.app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { cookie: a.cookie },
      });
      const meB = await ctx.app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { cookie: b.cookie },
      });
      expect(meA.json()).toMatchObject({ user: { id: a.user.id } });
      expect(meB.json()).toMatchObject({ user: { id: b.user.id } });

      await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { cookie: a.cookie },
      });
      const meBAfter = await ctx.app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { cookie: b.cookie },
      });
      expect(meBAfter.statusCode).toBe(200);
      expect(meBAfter.json()).toMatchObject({ user: { id: b.user.id } });
    });
  });
});

describe('auth rate limits', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp({ authRateLimitMax: 5 });
  });
  afterAll(() => ctx.close());

  it('limits login attempts per e-mail to 5 per minute, even across IPs', async () => {
    const email = uniqueEmail();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        remoteAddress: `10.0.0.${i + 1}`,
        payload: { email, password: 'qualquer-senha' },
      });
      statuses.push(res.statusCode);
      if (i === 5) expect(res.json()).toMatchObject({ code: 'RATE_LIMITED' });
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it('limits login attempts per IP to 5 per minute, even across e-mails', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        remoteAddress: '10.9.9.9',
        payload: { email: uniqueEmail(), password: 'qualquer-senha' },
      });
      statuses.push(res.statusCode);
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });
});
