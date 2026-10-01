import { is, sql, type SQL } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';

import * as schema from './schema/index';

export interface UserTable {
  /** Nome SQL da tabela. */
  name: string;
  table: PgTable;
  /** Condição que seleciona as linhas do usuário (direta ou pela linha-mãe). */
  ownedBy: (userId: string) => SQL;
}

/**
 * Tabelas com dados do usuário, derivadas do schema (ADR-061): as que têm `user_id` e, de forma
 * transitiva, as filhas ligadas por FK `on delete cascade` a uma delas (itens de refeição, séries,
 * templates...). É o mesmo conjunto que a exclusão da conta apaga. `users` fica de fora (tratada à
 * parte, sem o hash da senha).
 */
export function userTables(): UserTable[] {
  const tables: PgTable[] = [];
  for (const value of Object.values(schema) as unknown[])
    if (is(value, PgTable)) tables.push(value);
  const owned = new Map<string, UserTable>();

  for (const table of tables) {
    const config = getTableConfig(table);
    const userId = config.columns.find((c) => c.name === 'user_id');
    if (userId)
      owned.set(config.name, { name: config.name, table, ownedBy: (id) => sql`${userId} = ${id}` });
  }

  // Filhas por cascata, até não mudar mais (cadeias como set_logs → session_exercises → sessões).
  let changed = true;
  while (changed) {
    changed = false;
    for (const table of tables) {
      const config = getTableConfig(table);
      if (owned.has(config.name)) continue;
      for (const fk of config.foreignKeys) {
        if (fk.onDelete !== 'cascade') continue;
        const ref = fk.reference();
        const parent = owned.get(getTableConfig(ref.foreignTable).name);
        const [column] = ref.columns;
        const [parentColumn] = ref.foreignColumns;
        if (!parent || ref.columns.length !== 1 || !column || !parentColumn) continue;
        owned.set(config.name, {
          name: config.name,
          table,
          ownedBy: (id) =>
            sql`${column} in (select ${parentColumn} from ${parent.table} where ${parent.ownedBy(id)})`,
        });
        changed = true;
        break;
      }
    }
  }
  return [...owned.values()].sort((a, b) => a.name.localeCompare(b.name));
}
