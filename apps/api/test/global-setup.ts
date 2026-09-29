import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

import { runMigrations } from '@atlas/db/migrate';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

/** Postgres real: Testcontainers por padrão, ou TEST_DATABASE_URL (ADR-010). */
export async function setup(project: TestProject) {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    url = container.getConnectionUri();
  }
  await runMigrations(url);
  project.provide('databaseUrl', url);
}

export async function teardown() {
  await container?.stop();
}
