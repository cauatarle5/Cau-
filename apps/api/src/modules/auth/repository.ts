import { and, eq, gt, sessions, users, type Database, type User } from '@atlas/db';

export interface SessionWithUser {
  sessionId: string;
  expiresAt: Date;
  user: User;
}

/** Acesso a `users` e `sessions`. Operações sobre sessões exigem `userId` (exceto a busca pelo token). */
export function createAuthRepository(db: Database) {
  return {
    async findUserByEmail(email: string): Promise<User | undefined> {
      const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return row;
    },

    async insertUser(input: { email: string; name: string; passwordHash: string }): Promise<User> {
      const [row] = await db.insert(users).values(input).returning();
      if (!row) throw new Error('insert users returned no row');
      return row;
    },

    async insertSession(input: {
      userId: string;
      tokenHash: string;
      expiresAt: Date;
      userAgent: string | null;
      ip: string | null;
    }): Promise<void> {
      await db.insert(sessions).values(input);
    },

    /** Resolve o cookie: é a única leitura sem `userId`, pois é ela que o descobre. */
    async findValidSession(tokenHash: string, now: Date): Promise<SessionWithUser | undefined> {
      const [row] = await db
        .select({ sessionId: sessions.id, expiresAt: sessions.expiresAt, user: users })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
        .limit(1);
      return row;
    },

    async extendSession(userId: string, sessionId: string, expiresAt: Date): Promise<void> {
      await db
        .update(sessions)
        .set({ expiresAt })
        .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
    },

    async deleteSession(userId: string, sessionId: string): Promise<void> {
      await db.delete(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
    },
  };
}

export type AuthRepository = ReturnType<typeof createAuthRepository>;
