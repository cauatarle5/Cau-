import {
  aiActionProposals,
  aiConversations,
  aiMessages,
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lt,
  sql,
  weeklySummaries,
  type AiActionProposalRow,
  type Database,
} from '@atlas/db';

export type NewAiMessage = Omit<typeof aiMessages.$inferInsert, 'id' | 'userId' | 'createdAt'>;
export type NewProposal = Omit<
  typeof aiActionProposals.$inferInsert,
  'id' | 'userId' | 'createdAt' | 'status' | 'resolvedAt' | 'result'
>;

/** Conversas, mensagens, propostas e resumos do Coach; toda query filtra por `userId`. */
export function createCoachRepository(db: Database) {
  return {
    async createConversation(userId: string, title: string) {
      const [row] = await db.insert(aiConversations).values({ userId, title }).returning();
      if (!row) throw new Error('insert ai_conversations returned no row');
      return row;
    },

    listConversations(userId: string) {
      return db
        .select()
        .from(aiConversations)
        .where(eq(aiConversations.userId, userId))
        .orderBy(desc(aiConversations.updatedAt))
        .limit(50);
    },

    async getConversation(userId: string, id: string) {
      const [row] = await db
        .select()
        .from(aiConversations)
        .where(and(eq(aiConversations.userId, userId), eq(aiConversations.id, id)));
      return row;
    },

    async touchConversation(userId: string, id: string, title?: string) {
      await db
        .update(aiConversations)
        .set({ updatedAt: new Date(), ...(title ? { title } : {}) })
        .where(and(eq(aiConversations.userId, userId), eq(aiConversations.id, id)));
    },

    listMessages(userId: string, conversationId: string) {
      return db
        .select()
        .from(aiMessages)
        .where(and(eq(aiMessages.userId, userId), eq(aiMessages.conversationId, conversationId)))
        .orderBy(asc(aiMessages.createdAt), asc(aiMessages.id));
    },

    async insertMessage(userId: string, values: NewAiMessage) {
      const [row] = await db
        .insert(aiMessages)
        .values({ ...values, userId })
        .returning();
      if (!row) throw new Error('insert ai_messages returned no row');
      return row;
    },

    /** Tokens (entrada + saída) gastos pelo usuário desde `since` (limite diário, ADR-056). */
    async tokensSince(userId: string, since: Date): Promise<number> {
      const [row] = await db
        .select({
          total: sql<number>`coalesce(sum(${aiMessages.tokensIn} + ${aiMessages.tokensOut}), 0)::int`,
        })
        .from(aiMessages)
        .where(and(eq(aiMessages.userId, userId), gte(aiMessages.createdAt, since)));
      return row?.total ?? 0;
    },

    // Propostas ---------------------------------------------------------------

    async createProposal(userId: string, values: NewProposal) {
      const [row] = await db
        .insert(aiActionProposals)
        .values({ ...values, userId })
        .returning();
      if (!row) throw new Error('insert ai_action_proposals returned no row');
      return row;
    },

    /** Marca como expiradas as pendentes vencidas do usuário (nunca uma sendo aplicada). */
    async expireProposals(userId: string, now: Date) {
      await db
        .update(aiActionProposals)
        .set({ status: 'expired', resolvedAt: now })
        .where(
          and(
            eq(aiActionProposals.userId, userId),
            eq(aiActionProposals.status, 'pending'),
            sql`${aiActionProposals.resolvedAt} is null`,
            lt(aiActionProposals.expiresAt, now),
          ),
        );
    },

    listProposals(userId: string, status?: AiActionProposalRow['status']) {
      return db
        .select()
        .from(aiActionProposals)
        .where(
          and(
            eq(aiActionProposals.userId, userId),
            ...(status ? [eq(aiActionProposals.status, status)] : []),
          ),
        )
        .orderBy(desc(aiActionProposals.createdAt))
        .limit(50);
    },

    proposalsByIds(userId: string, ids: readonly string[]) {
      if (ids.length === 0) return Promise.resolve([] as AiActionProposalRow[]);
      return db
        .select()
        .from(aiActionProposals)
        .where(and(eq(aiActionProposals.userId, userId), inArray(aiActionProposals.id, [...ids])));
    },

    async getProposal(userId: string, id: string) {
      const [row] = await db
        .select()
        .from(aiActionProposals)
        .where(and(eq(aiActionProposals.userId, userId), eq(aiActionProposals.id, id)));
      return row;
    },

    /**
     * Resolve só se ainda pendente. Descartar exige que ninguém esteja aplicando (`resolvedAt`
     * nulo); concluir a aplicação exige a trava de `claimProposal`.
     */
    async resolveProposal(
      userId: string,
      id: string,
      status: 'accepted' | 'rejected',
      result: unknown,
    ) {
      const [row] = await db
        .update(aiActionProposals)
        .set({ status, result, resolvedAt: new Date() })
        .where(
          and(
            eq(aiActionProposals.userId, userId),
            eq(aiActionProposals.id, id),
            eq(aiActionProposals.status, 'pending'),
            status === 'accepted'
              ? sql`${aiActionProposals.resolvedAt} is not null`
              : sql`${aiActionProposals.resolvedAt} is null`,
          ),
        )
        .returning();
      return row;
    },

    /** Trava a proposta para aplicar uma vez só (dois cliques simultâneos). */
    async claimProposal(userId: string, id: string, now: Date) {
      const [row] = await db
        .update(aiActionProposals)
        .set({ resolvedAt: now })
        .where(
          and(
            eq(aiActionProposals.userId, userId),
            eq(aiActionProposals.id, id),
            eq(aiActionProposals.status, 'pending'),
            sql`${aiActionProposals.resolvedAt} is null`,
          ),
        )
        .returning();
      return row;
    },

    async releaseProposal(userId: string, id: string) {
      await db
        .update(aiActionProposals)
        .set({ resolvedAt: null })
        .where(
          and(
            eq(aiActionProposals.userId, userId),
            eq(aiActionProposals.id, id),
            eq(aiActionProposals.status, 'pending'),
          ),
        );
    },

    // Resumo semanal -------------------------------------------------------------

    async upsertWeeklySummary(
      userId: string,
      values: Omit<typeof weeklySummaries.$inferInsert, 'id' | 'userId' | 'createdAt'>,
    ) {
      const [row] = await db
        .insert(weeklySummaries)
        .values({ ...values, userId })
        .onConflictDoUpdate({
          target: [weeklySummaries.userId, weeklySummaries.weekStart],
          set: { ...values, createdAt: new Date() },
        })
        .returning();
      if (!row) throw new Error('upsert weekly_summaries returned no row');
      return row;
    },

    async latestWeeklySummary(userId: string) {
      const [row] = await db
        .select()
        .from(weeklySummaries)
        .where(eq(weeklySummaries.userId, userId))
        .orderBy(desc(weeklySummaries.weekStart))
        .limit(1);
      return row;
    },

    async hasWeeklySummary(userId: string, weekStart: string) {
      const [row] = await db
        .select({ id: weeklySummaries.id })
        .from(weeklySummaries)
        .where(and(eq(weeklySummaries.userId, userId), eq(weeklySummaries.weekStart, weekStart)));
      return row !== undefined;
    },
  };
}

export type CoachRepository = ReturnType<typeof createCoachRepository>;
