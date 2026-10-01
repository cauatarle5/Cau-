import { is } from 'drizzle-orm';
import { getTableConfig, PgTable, type PgColumn } from 'drizzle-orm/pg-core';

import * as schema from './schema/index';

export interface UserTable {
  /** Nome SQL da tabela. */
  name: string;
  table: PgTable;
  userId: PgColumn;
}

/**
 * Tabelas com dados do usuário (coluna `user_id`), derivadas do schema (ADR-061): uma tabela nova
 * entra sozinha na exportação. `users` fica de fora (tratada à parte, sem o hash da senha).
 */
export function userTables(): UserTable[] {
  const out: UserTable[] = [];
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const config = getTableConfig(value);
    const userId = config.columns.find((c) => c.name === 'user_id');
    if (userId) out.push({ name: config.name, table: value, userId });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
