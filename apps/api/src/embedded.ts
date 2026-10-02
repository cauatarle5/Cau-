import type { IncomingMessage, ServerResponse } from 'node:http';

import type { FastifyInstance } from 'fastify';

import { createDb } from '@atlas/db';

import { buildApp } from './app';
import { loadConfig } from './config';

/**
 * API embutida em outro servidor Node (Next na Vercel, ADR-064): uma instância por processo,
 * criada no primeiro request e reaproveitada entre invocações. O request Node segue direto para o
 * roteador do Fastify, com streaming (SSE do Coach) preservado.
 */
let ready: Promise<FastifyInstance> | null = null;

function instance(): Promise<FastifyInstance> {
  ready ??= (async () => {
    const config = loadConfig();
    const max = Number(process.env.DB_POOL_MAX ?? 3);
    const { db } = createDb(config.databaseUrl, { max: Number.isFinite(max) && max > 0 ? max : 3 });
    const app = await buildApp({ config, db });
    await app.ready();
    return app;
  })().catch((err: unknown) => {
    // Falha na inicialização (ex.: env ausente) não fica em cache: a próxima chamada tenta de novo.
    ready = null;
    throw err;
  });
  return ready;
}

export async function handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await instance();
  app.routing(req, res);
}
