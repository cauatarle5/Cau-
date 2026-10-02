import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config';

import { createTestApp, type TestContext } from './helpers';

const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';

describe('rodada horária por HTTP (ADR-064)', () => {
  let withSecret: TestContext;
  let without: TestContext;
  beforeAll(async () => {
    withSecret = await createTestApp({ cronSecret: SECRET });
    without = await createTestApp();
  });
  afterAll(async () => {
    await withSecret.close();
    await without.close();
  });

  const tick = (ctx: TestContext, authorization?: string) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/v1/internal/tick',
      headers: authorization ? { authorization } : {},
    });

  it('runs the jobs only with the right secret', async () => {
    expect((await tick(withSecret)).statusCode).toBe(401);
    expect((await tick(withSecret, 'Bearer errado')).statusCode).toBe(401);
    expect((await tick(withSecret, SECRET)).statusCode).toBe(401);
    const ok = await tick(withSecret, `Bearer ${SECRET}`);
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ ok: true });
    expect(ok.json<{ energy: number }>().energy).toBeTypeOf('number');
  });

  it('does not exist without CRON_SECRET', async () => {
    expect((await tick(without, `Bearer ${SECRET}`)).statusCode).toBe(404);
  });

  it('config: TRUST_PROXY=true trusts the platform proxy; short CRON_SECRET is refused', () => {
    const base = { DATABASE_URL: 'postgres://x' };
    expect(loadConfig({ ...base, TRUST_PROXY: 'true' }).trustProxy).toBe(true);
    expect(loadConfig({ ...base }).trustProxy).toBe('loopback');
    expect(() => loadConfig({ ...base, CRON_SECRET: 'curto' })).toThrow();
    expect(loadConfig({ ...base, CRON_SECRET: SECRET }).cronSecret).toBe(SECRET);
    // APP_ENV prevalece sobre o NODE_ENV fixado pelo hospedeiro; AI_FAKE segue proibido em produção.
    expect(loadConfig({ ...base, NODE_ENV: 'production', APP_ENV: 'test' }).nodeEnv).toBe('test');
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', AI_FAKE: 'true' })).toThrow();
    expect(loadConfig({ ...base, NODE_ENV: 'production' }).cookieSecure).toBe(true);
  });
});
