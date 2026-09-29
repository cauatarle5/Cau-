import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type TestContext } from './helpers';

describe('unexpected errors', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp({}, (app) => {
      app.get('/boom', () => {
        throw new Error('secret internal detail');
      });
    });
  });
  afterAll(() => ctx.close());

  it('returns a generic 500 without leaking the stack or message', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.headers['content-type']).toContain('application/problem+json');
    const body = res.json<Record<string, unknown>>();
    expect(body).toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
    expect(body.requestId).toBe(res.headers['x-request-id']);
    expect(res.body).not.toContain('secret internal detail');
    expect(res.body).not.toContain('at ');
  });
});
