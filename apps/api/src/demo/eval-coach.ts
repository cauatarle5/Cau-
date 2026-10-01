import { COACH_EVAL_CASES, missingToolGroups, type CoachTransport } from '@atlas/ai';
import { createFoodParser } from '@atlas/ai';
import { localDate } from '@atlas/core';
import { aiMessages, and, eq, type Database } from '@atlas/db';
import type { ChatEvent } from '@atlas/schemas';

import { createCoachRepository, createCoachService } from '../modules/coach';
import { createServices } from '../services';

import { DEMO_TZ, seedDemo } from './seed';

export interface CoachEvalResult {
  id: string;
  question: string;
  tools: string[];
  missingTools: string[][];
  ungrounded: string[];
  text: string;
  error: string | null;
  tokens: number;
  pass: boolean;
}

/**
 * Avaliação do Coach (P10.4) sobre o usuário demo recém-semeado: cada pergunta numa conversa
 * nova; passa se usar as ferramentas esperadas e não citar número fora dos retornos (ADR-055).
 */
export async function runCoachEval(params: {
  db: Database;
  transport: CoachTransport;
  model: string;
  today?: string;
  /** E-mail do usuário demo (testes em paralelo usam outro). */
  email?: string;
}): Promise<CoachEvalResult[]> {
  const today = params.today ?? localDate(new Date(), DEMO_TZ);
  const { userId } = await seedDemo(params.db, {
    today,
    ...(params.email ? { email: params.email } : {}),
  });
  const svc = createServices(params.db);
  const repo = createCoachRepository(params.db);
  const coach = createCoachService({
    repo,
    svc,
    parser: createFoodParser({}),
    config: {
      transport: params.transport,
      model: params.model,
      dailyTokenLimit: Number.MAX_SAFE_INTEGER,
    },
  });
  const ctx = { userId, timezone: DEMO_TZ, today };
  const results: CoachEvalResult[] = [];
  for (const c of COACH_EVAL_CASES) {
    const conv = await coach.createConversation(userId, c.id);
    let error: string | null = null;
    let text = '';
    let tools: string[] = [];
    try {
      const prepared = await coach.prepare(ctx, conv.id);
      await coach.send(ctx, prepared, c.question, (e: ChatEvent) => {
        if (e.type === 'error') error = e.message;
        if (e.type === 'done') {
          text = e.message.text;
          tools = e.message.toolCalls;
        }
      });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    const [row] = await params.db
      .select()
      .from(aiMessages)
      .where(and(eq(aiMessages.conversationId, conv.id), eq(aiMessages.role, 'assistant')));
    const ungrounded = row?.ungrounded ?? [];
    const missingTools = missingToolGroups(c.expectTools, tools);
    results.push({
      id: c.id,
      question: c.question,
      tools,
      missingTools,
      ungrounded,
      text,
      error,
      tokens: (row?.tokensIn ?? 0) + (row?.tokensOut ?? 0),
      pass: error === null && text !== '' && missingTools.length === 0 && ungrounded.length === 0,
    });
  }
  return results;
}

/** Relatório em Markdown (pt-BR). */
export function coachEvalReport(results: CoachEvalResult[], meta: { model: string; date: string }) {
  const passed = results.filter((r) => r.pass).length;
  const lines = [
    `# Avaliação do Coach (P10.4)`,
    '',
    `- Data: ${meta.date}`,
    `- Modelo: ${meta.model}`,
    `- Resultado: **${String(passed)}/${String(results.length)}**`,
    `- Tokens: ${String(results.reduce((a, r) => a + r.tokens, 0))}`,
    '',
    '| Pergunta | Ferramentas | Faltou | Números soltos | OK |',
    '|---|---|---|---|---|',
    ...results.map(
      (r) =>
        `| ${r.question} | ${r.tools.join(', ') || '—'} | ${r.missingTools.map((g) => g.join(' ou ')).join('; ') || '—'} | ${r.ungrounded.join(', ') || '—'} | ${r.pass ? 'sim' : `não${r.error ? ` (${r.error})` : ''}`} |`,
    ),
    '',
    '## Respostas',
    '',
    ...results.flatMap((r) => [`### ${r.question}`, '', r.text || '_sem resposta_', '']),
  ];
  return lines.join('\n');
}
