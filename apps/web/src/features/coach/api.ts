import { ApiError, apiRequest, problemFrom } from '@/lib/api';
import type {
  aiStatusSchema,
  conversationDetailSchema,
  conversationListSchema,
  conversationSchema,
  proposalListSchema,
  proposalSchema,
  weeklySummaryResponseSchema,
} from '@atlas/schemas';
import type { ChatEvent } from '@atlas/schemas';

export const coachApi = {
  status: () => apiRequest<typeof aiStatusSchema>('/ai/status'),
  conversations: () => apiRequest<typeof conversationListSchema>('/ai/conversations'),
  conversation: (id: string) =>
    apiRequest<typeof conversationDetailSchema>(`/ai/conversations/${id}`),
  createConversation: () =>
    apiRequest<typeof conversationSchema>('/ai/conversations', { method: 'POST', body: {} }),
  pendingProposals: () => apiRequest<typeof proposalListSchema>('/ai/proposals?status=pending'),
  accept: (id: string) =>
    apiRequest<typeof proposalSchema>(`/ai/proposals/${id}/accept`, { method: 'POST' }),
  reject: (id: string) =>
    apiRequest<typeof proposalSchema>(`/ai/proposals/${id}/reject`, { method: 'POST' }),
  weeklySummary: () => apiRequest<typeof weeklySummaryResponseSchema>('/ai/weekly-summary'),
};

/**
 * Envia uma mensagem e lê a resposta em SSE (ADR-054). Erros antes do stream (503, 429, 404)
 * chegam como `ApiError`; depois, como evento `error`.
 */
export async function streamMessage(
  conversationId: string,
  text: string,
  onEvent: (e: ChatEvent) => void,
): Promise<void> {
  const res = await fetch(`/api/v1/ai/conversations/${conversationId}/messages`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok || !res.body) {
    throw new ApiError(await problemFrom(res));
  }
  // Eventos SSE não passam pelo serializador da API: validados aqui, com o schema carregado só
  // quando há conversa (ADR-062).
  const { chatEventSchema } = await import('@atlas/schemas');
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let finished = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let end = buffer.indexOf('\n\n');
    while (end !== -1) {
      const chunk = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (data) {
        let json: unknown = null;
        try {
          json = JSON.parse(data.slice(6));
        } catch {
          // quadro inválido: ignora
        }
        const parsed = chatEventSchema.safeParse(json);
        if (parsed.success) {
          if (parsed.data.type === 'done' || parsed.data.type === 'error') finished = true;
          onEvent(parsed.data);
        }
      }
      end = buffer.indexOf('\n\n');
    }
  }
  // Conexão caiu sem resposta final.
  if (!finished)
    onEvent({
      type: 'error',
      code: 'AI_ERROR',
      message: 'A conexão caiu antes da resposta terminar.',
    });
}
