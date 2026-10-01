import type { FastifyBaseLogger } from 'fastify';
import { PgBoss } from 'pg-boss';

import { localClock, localDate } from '@atlas/core';

import type { EnergyService } from '../modules/insights/energy';
import type { InsightsRepository } from '../modules/insights/repository';
import type { InsightsService } from '../modules/insights/service';

const TICK = 'hourly-tick';
const IDEMPOTENCY_TTL_DAYS = 7;

export interface JobDeps {
  repo: InsightsRepository;
  energy: EnergyService;
  insights: InsightsService;
  log: FastifyBaseLogger;
}

/**
 * Uma rodada do job horário (ADR-049): GET adaptativo segunda às 04:00 e insights às 05:00
 * no fuso de cada usuário; limpeza de `idempotency_keys` às 03:00 UTC. Exportado para testes.
 */
export async function runTick(deps: JobDeps, now: Date) {
  const users = await deps.repo.usersWithTimezone();
  let energy = 0;
  let insights = 0;
  for (const u of users) {
    const { hour, weekday } = localClock(now, u.timezone);
    const today = localDate(now, u.timezone);
    try {
      if (weekday === 1 && hour === 4) {
        await deps.energy.refresh(u.id, today);
        energy += 1;
      }
      if (hour === 5) {
        await deps.insights.refresh(u.id, today, now);
        insights += 1;
      }
    } catch (err) {
      // Um usuário com erro não impede os outros.
      deps.log.error({ err, userId: u.id }, 'scheduled job failed for user');
    }
  }
  if (now.getUTCHours() === 3) {
    await deps.repo.purgeIdempotencyKeys(
      new Date(now.getTime() - IDEMPOTENCY_TTL_DAYS * 86_400_000),
    );
  }
  return { energy, insights };
}

/** Sobe o pg-boss no processo da API e agenda o job horário (ADR-049). */
export async function startJobs(databaseUrl: string, deps: JobDeps) {
  const boss = new PgBoss(databaseUrl);
  boss.on('error', (err) => {
    deps.log.error({ err }, 'pg-boss error');
  });
  await boss.start();
  await boss.createQueue(TICK);
  await boss.schedule(TICK, '0 * * * *', null, { tz: 'UTC' });
  await boss.work(TICK, async () => {
    const result = await runTick(deps, new Date());
    deps.log.info(result, 'hourly jobs done');
  });
  return () => boss.stop({ graceful: true });
}
