import { z } from 'zod';

export const conversationSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ConversationDto = z.infer<typeof conversationSchema>;
export const conversationListSchema = z.object({ items: z.array(conversationSchema) });

export const proposalSchema = z.object({
  id: z.uuid(),
  actionType: z.enum(['log_meal', 'plan_meal', 'swap_exercise', 'adapt_workout', 'update_goal']),
  summary: z.string(),
  status: z.enum(['pending', 'accepted', 'rejected', 'expired']),
  /** Linhas do cartão (alimentos e quantidades, mudanças), já formatadas pelo servidor. */
  details: z.array(z.string()),
  conversationId: z.uuid().nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
  resolvedAt: z.string().nullable(),
  /** Ao aplicar: para onde levar o usuário (ex.: /nutricao). */
  link: z.string().nullable(),
});
export type ProposalDto = z.infer<typeof proposalSchema>;
export const proposalListSchema = z.object({ items: z.array(proposalSchema) });
export const proposalQuerySchema = z.object({
  status: z.enum(['pending', 'accepted', 'rejected', 'expired']).optional(),
});

export const chatMessageSchema = z.object({
  id: z.uuid(),
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  toolCalls: z.array(z.string()),
  proposals: z.array(proposalSchema),
  createdAt: z.string(),
});
export type ChatMessageDto = z.infer<typeof chatMessageSchema>;

export const conversationDetailSchema = conversationSchema.extend({
  messages: z.array(chatMessageSchema),
});
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

export const conversationCreateSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
});
export const chatSendSchema = z.object({
  text: z.string().trim().min(1, { message: 'Escreva sua pergunta' }).max(2000),
});

/**
 * Eventos SSE de `POST ai/conversations/:id/messages` (ADR-054): `text` (delta), `tool`
 * (consultando), `proposal`, `notice`, `done` (mensagem gravada) e `error` (RFC 7807).
 */
export const chatEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), delta: z.string() }),
  z.object({ type: z.literal('tool'), name: z.string(), label: z.string() }),
  z.object({ type: z.literal('proposal'), proposal: proposalSchema }),
  z.object({ type: z.literal('notice'), message: z.string() }),
  z.object({ type: z.literal('done'), message: chatMessageSchema }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
]);
export type ChatEvent = z.infer<typeof chatEventSchema>;

export const aiStatusSchema = z.object({
  available: z.boolean(),
  tokensToday: z.number().int(),
  dailyLimit: z.number().int(),
});
export type AiStatus = z.infer<typeof aiStatusSchema>;

export const weeklySummarySchema = z.object({
  weekStart: z.string(),
  text: z.string(),
  source: z.enum(['ai', 'template']),
  createdAt: z.string(),
});
export type WeeklySummaryDto = z.infer<typeof weeklySummarySchema>;
export const weeklySummaryResponseSchema = z.object({ summary: weeklySummarySchema.nullable() });
