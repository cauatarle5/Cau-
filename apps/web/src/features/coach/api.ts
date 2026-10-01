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
