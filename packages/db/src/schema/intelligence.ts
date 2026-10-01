import {
  date,
  doublePrecision,
  integer,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAt, idColumn, updatedAt } from './columns';
import {
  aiActionTypeEnum,
  aiProposalStatusEnum,
  aiRoleEnum,
  energyConfidenceEnum,
  insightCategoryEnum,
  insightSeverityEnum,
  insightStatusEnum,
  summarySourceEnum,
} from './enums';
import { users } from './users';

const userRef = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

/** GET adaptativo semanal (DATA_MODEL 4.7, P5.3, ADR-051). */
export const energyEstimates = pgTable(
  'energy_estimates',
  {
    id: idColumn(),
    userId: userRef(),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    tdeeFormula: doublePrecision('tdee_formula').notNull(),
    tdeeObserved: doublePrecision('tdee_observed'),
    tdeeUsed: doublePrecision('tdee_used').notNull(),
    confidence: energyConfidenceEnum('confidence').notNull(),
    weightTrendKg: doublePrecision('weight_trend_kg'),
    intakeAvgKcal: doublePrecision('intake_avg_kcal'),
    loggedDays: smallint('logged_days').notNull(),
    weighInCount: smallint('weigh_in_count').notNull(),
    /** Janela e GET anterior usados no cálculo. */
    inputs: jsonb('inputs').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('energy_estimates_user_week_uq').on(t.userId, t.weekStart)],
);

/** Insights determinísticos (DATA_MODEL 4.8, ADR-050). */
export const insights = pgTable(
  'insights',
  {
    id: idColumn(),
    userId: userRef(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    category: insightCategoryEnum('category').notNull(),
    type: text('type').notNull(),
    /** Chave de deduplicação dentro do tipo. */
    dedupKey: text('dedup_key').notNull(),
    severity: insightSeverityEnum('severity').notNull(),
    titlePt: text('title_pt').notNull(),
    bodyPt: text('body_pt').notNull(),
    data: jsonb('data').notNull(),
    status: insightStatusEnum('status').notNull().default('new'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('insights_user_type_key_uq').on(t.userId, t.type, t.dedupKey),
    index('insights_user_status_idx').on(t.userId, t.status, t.expiresAt),
  ],
);

/** Conversas com o Coach (DATA_MODEL 4.8, ADR-054). */
export const aiConversations = pgTable(
  'ai_conversations',
  {
    id: idColumn(),
    userId: userRef(),
    title: text('title').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('ai_conversations_user_idx').on(t.userId, t.updatedAt)],
);

/**
 * Mensagens: `content` guarda os blocos da API (texto, tool_use, tool_result) para reenviar o
 * histórico sem reescrever; `text` é o que a tela mostra.
 */
export const aiMessages = pgTable(
  'ai_messages',
  {
    id: idColumn(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => aiConversations.id, { onDelete: 'cascade' }),
    userId: userRef(),
    role: aiRoleEnum('role').notNull(),
    text: text('text').notNull(),
    content: jsonb('content').notNull(),
    toolCalls: jsonb('tool_calls').notNull().default([]),
    /** Números citados que não estão nos retornos das ferramentas (ADR-055). */
    ungrounded: text('ungrounded').array().notNull().default([]),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    model: text('model'),
    createdAt: createdAt(),
  },
  (t) => [
    index('ai_messages_conversation_idx').on(t.conversationId, t.createdAt),
    index('ai_messages_user_created_idx').on(t.userId, t.createdAt),
  ],
);

/** Propostas de escrita do Coach: nada é gravado sem confirmação (P10.2, ADR-056). */
export const aiActionProposals = pgTable(
  'ai_action_proposals',
  {
    id: idColumn(),
    userId: userRef(),
    conversationId: uuid('conversation_id').references(() => aiConversations.id, {
      onDelete: 'set null',
    }),
    actionType: aiActionTypeEnum('action_type').notNull(),
    /** Payload validado e o resumo exibido no cartão. */
    payload: jsonb('payload').notNull(),
    summary: text('summary').notNull(),
    status: aiProposalStatusEnum('status').notNull().default('pending'),
    /** Resultado ao aplicar (ids criados) ou motivo da falha. */
    result: jsonb('result'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [index('ai_action_proposals_user_status_idx').on(t.userId, t.status, t.createdAt)],
);

/** Resumo semanal (P10.5, ADR-056). */
export const weeklySummaries = pgTable(
  'weekly_summaries',
  {
    id: idColumn(),
    userId: userRef(),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    text: text('text').notNull(),
    source: summarySourceEnum('source').notNull(),
    data: jsonb('data').notNull(),
    model: text('model'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('weekly_summaries_user_week_uq').on(t.userId, t.weekStart)],
);

export type AiConversationRow = typeof aiConversations.$inferSelect;
export type AiMessageRow = typeof aiMessages.$inferSelect;
export type AiActionProposalRow = typeof aiActionProposals.$inferSelect;
export type WeeklySummaryRow = typeof weeklySummaries.$inferSelect;
export type EnergyEstimateRow = typeof energyEstimates.$inferSelect;
export type InsightRow = typeof insights.$inferSelect;
