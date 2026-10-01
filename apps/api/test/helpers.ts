import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { inject } from 'vitest';

import { createDb, type DbHandle } from '@atlas/db';

import { buildApp } from '../src/app';
import type { AppConfig } from '../src/config';

export const WEB_ORIGIN = 'http://localhost:3000';

export interface TestContext {
  app: FastifyInstance;
  handle: DbHandle;
  close: () => Promise<void>;
}

export async function createTestApp(
  overrides: Partial<AppConfig> = {},
  beforeReady?: (app: FastifyInstance) => void,
): Promise<TestContext> {
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
      trustProxy: 'loopback',
      jobsEnabled: false,
      anthropicApiKey: undefined,
      aiModelFast: undefined,
      aiRateLimitMax: 1000,
      ...overrides,
    },
    db: handle.db,
  });
  beforeReady?.(app);
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

/** Atalho: requisição autenticada com o cookie dado. */
export function as(app: FastifyInstance, cookie: string) {
  return (opts: InjectOptions) =>
    app.inject({ ...opts, headers: { ...(opts.headers ?? {}), cookie } });
}

export const PROFILE_MALE = {
  sex: 'male',
  birthDate: '1990-01-01',
  heightCm: 180,
  trainingExperience: 'beginner',
  conditioningLevel: 3,
  activityLifestyle: 'moderate',
} as const;

/** Usuário com onboarding completo; peso 80 kg hoje. */
export async function onboardedUser(app: FastifyInstance, today: string) {
  const u = await registerUser(app);
  const call = as(app, u.cookie);
  await call({ method: 'PUT', url: '/api/v1/profile', payload: PROFILE_MALE });
  await call({ method: 'POST', url: '/api/v1/goals', payload: { primaryGoal: 'fat_loss' } });
  await call({
    method: 'POST',
    url: '/api/v1/body-measurements',
    payload: { date: today, weightKg: 80 },
  });
  return { ...u, call };
}
