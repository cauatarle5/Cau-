import { ApiError, apiRequest } from '@/lib/api';
import {
  aiStatusSchema,
  chatEventSchema,
  conversationDetailSchema,
  conversationListSchema,
  conversationSchema,
  problemDetailsSchema,
  proposalListSchema,
  proposalSchema,
  weeklySummaryResponseSchema,
  type ChatEvent,
} from '@atlas/schemas';

export const coachApi = {
  status: () => apiRequest('/ai/status', aiStatusSchema),
  conversations: () => apiRequest('/ai/conversations', conversationListSchema),
  conversation: (id: string) => apiRequest(`/ai/conversations/${id}`, conversationDetailSchema),
  createConversation: () =>
    apiRequest('/ai/conversations', conversationSchema, { method: 'POST', body: {} }),
  pendingProposals: () => apiRequest('/ai/proposals?status=pending', proposalListSchema),
  accept: (id: string) =>
    apiRequest(`/ai/proposals/${id}/accept`, proposalSchema, { method: 'POST' }),
  reject: (id: string) =>
    apiRequest(`/ai/proposals/${id}/reject`, proposalSchema, { method: 'POST' }),
  weeklySummary: () => apiRequest('/ai/weekly-summary', weeklySummaryResponseSchema),
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
    const parsed = problemDetailsSchema.safeParse(await res.json().catch(() => null));
    throw new ApiError(
      parsed.success
        ? parsed.data
        : {
            type: 'about:blank',
            title: 'Falha de comunicação',
            status: res.status,
            code: 'INTERNAL_ERROR',
            detail: 'Não foi possível falar com o Coach. Tente novamente.',
          },
    );
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
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
        const parsed = chatEventSchema.safeParse(JSON.parse(data.slice(6)));
        if (parsed.success) onEvent(parsed.data);
      }
      end = buffer.indexOf('\n\n');
    }
  }
}
