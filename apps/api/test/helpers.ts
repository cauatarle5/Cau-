import { randomUUID } from 'node:crypto';

import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { inject } from 'vitest';

import { createDb, type DbHandle } from '@atlas/db';

import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';

export const WEB_ORIGIN = 'http://localhost:3000';

export interface TestContext {
  app: FastifyInstance;
  handle: DbHandle;
  close: () => Promise<void>;
}

export async function createTestApp(overrides: Partial<AppConfig> = {}): Promise<TestContext> {
  const databaseUrl = inject('databaseUrl');
  const handle = createDb(databaseUrl);
  const app = await buildApp({
    config: {
      nodeEnv: 'test',
      databaseUrl,
      host: '127.0.0.1',
      port: 0,
      logLevel: 'silent',
      webOrigin: WEB_ORIGIN,
      cookieSecure: false,
      authRateLimitMax: 1000,
      ...overrides,
    },
    db: handle.db,
  });
  await app.ready();
  return {
    app,
    handle,
    close: async () => {
      await app.close();
      await handle.close();
    },
  };
}

export const uniqueEmail = () => `user-${randomUUID()}@example.com`;

export function sessionCookie(res: LightMyRequestResponse): string {
  const cookie = res.cookies.find((c) => c.name === 'atlas_session');
  if (!cookie) throw new Error('no session cookie in response');
  return `atlas_session=${cookie.value}`;
}

export async function registerUser(
  app: FastifyInstance,
  data: { name?: string; email?: string; password?: string } = {},
) {
  const payload = {
    name: data.name ?? 'Usuário Teste',
    email: data.email ?? uniqueEmail(),
    password: data.password ?? 'senha-segura-123',
  };
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  return {
    res,
    payload,
    cookie: sessionCookie(res),
    user: res.json<{ user: { id: string } }>().user,
  };
}
