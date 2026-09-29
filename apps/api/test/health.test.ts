import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type TestContext } from './helpers';

describe('GET /api/v1/health', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  it('reports ok with database up', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('echoes a valid x-request-id and generates one otherwise', async () => {
    const echoed = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { 'x-request-id': 'abc-123' },
    });
    expect(echoed.headers['x-request-id']).toBe('abc-123');
    const generated = await ctx.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('maps framework 4xx errors to BAD_REQUEST', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('returns RFC 7807 404 for unknown routes', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/does-not-exist' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json()).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});
