import { eq, users, userTables, type Database, type User } from '@atlas/db';

/** Fora da exportação: segredos de sessão e respostas técnicas de idempotência (ADR-061). */
export const EXPORT_EXCLUDED = new Set(['sessions', 'idempotency_keys']);

/** Exportação e exclusão da conta; tudo filtrado pelo `userId` da sessão. */
export function createAccountRepository(db: Database) {
  return {
    async findUser(userId: string): Promise<User | undefined> {
      const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      return row;
    },

    async exportTables(userId: string): Promise<Record<string, Record<string, unknown>[]>> {
      const out: Record<string, Record<string, unknown>[]> = {};
      for (const t of userTables()) {
        if (EXPORT_EXCLUDED.has(t.name)) continue;
        out[t.name] = await db.select().from(t.table).where(eq(t.userId, userId));
      }
      return out;
    },

    /** Apaga o usuário; as FKs `on delete cascade` levam todos os dados dele. */
    async deleteUser(userId: string): Promise<void> {
      await db.delete(users).where(eq(users.id, userId));
    },
  };
}

export type AccountRepository = ReturnType<typeof createAccountRepository>;
