import type Anthropic from '@anthropic-ai/sdk';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CoachTransport } from '@atlas/ai';
import { localDate } from '@atlas/core';
import { aiActionProposals, aiMessages, eq } from '@atlas/db';
import type { ChatEvent, ProposalDto } from '@atlas/schemas';

import { as, createTestApp, onboardedUser, registerUser, type TestContext } from './helpers';

const today = localDate(new Date(), 'America/Sao_Paulo');
const MISSING = '00000000-0000-7000-8000-000000000000';

/** Eventos de uma resposta SSE. */
function events(res: LightMyRequestResponse): ChatEvent[] {
  return res.body.split('\n\n').flatMap((chunk) => {
    const data = chunk.split('\n').find((l) => l.startsWith('data: '));
    return data ? [JSON.parse(data.slice(6)) as ChatEvent] : [];
  });
}

type Call = { name: string; input: Record<string, unknown> };

const message = (content: unknown[], stop: string) =>
  ({
    content,
    stop_reason: stop,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  }) as unknown as Anthropic.Beta.BetaMessage;

/** Transporte que chama as ferramentas de `plan` e responde com o texto dado. */
function toolsThenText(plan: () => Call[], text: (results: string[]) => string): CoachTransport {
  return (params, onText) => {
    const last = params.messages.at(-1);
    if (typeof last?.content === 'string') {
      return Promise.resolve(
        message(
          plan().map((c, i) => ({
            type: 'tool_use',
            id: `t${String(i)}`,
            name: c.name,
            input: c.input,
          })),
          'tool_use',
        ),
      );
    }
    const results = (last?.content as { content: string }[]).map((c) => c.content);
    const t = text(results);
    onText(t);
    return Promise.resolve(message([{ type: 'text', text: t }], 'end_turn'));
  };
}

async function newConversation(call: ReturnType<typeof as>) {
  const res = await call({ method: 'POST', url: '/api/v1/ai/conversations', payload: {} });
  expect(res.statusCode).toBe(201);
  return res.json<{ id: string }>().id;
}

const send = (call: ReturnType<typeof as>, id: string, text: string) =>
  call({ method: 'POST', url: `/api/v1/ai/conversations/${id}/messages`, payload: { text } });

describe('coach without AI configured (ADR-056)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  it('chat answers 503 AI_UNAVAILABLE; weekly summary falls back to the template', async () => {
    const u = await onboardedUser(ctx.app, today);
    const status = await u.call({ method: 'GET', url: '/api/v1/ai/status' });
    expect(status.json()).toEqual({ available: false, tokensToday: 0, dailyLimit: 200_000 });
    const id = await newConversation(u.call);
    const res = await send(u.call, id, 'Como foi minha semana?');
    expect(res.statusCode).toBe(503);
    expect(res.json<{ code: string }>().code).toBe('AI_UNAVAILABLE');
    // Nada gravado na conversa.
    const conv = await u.call({ method: 'GET', url: `/api/v1/ai/conversations/${id}` });
    expect(conv.json<{ messages: unknown[] }>().messages).toEqual([]);

    expect((await u.call({ method: 'GET', url: '/api/v1/ai/weekly-summary' })).json()).toEqual({
      summary: null,
    });
    const refresh = await u.call({ method: 'POST', url: '/api/v1/ai/weekly-summary/refresh' });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.json<{ source: string; text: string }>()).toMatchObject({
      source: 'template',
      text: expect.stringContaining('Na semana de') as string,
    });
    expect(
      (await u.call({ method: 'GET', url: '/api/v1/ai/weekly-summary' })).json<{
        summary: { source: string } | null;
      }>().summary?.source,
    ).toBe('template');
  });
});

describe('coach with the scripted transport (AI_FAKE)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp({ aiFake: true });
  });
  afterAll(() => ctx.close());

  it('streams an answer with tools, persists the conversation, numbers grounded; isolation', async () => {
    const a = await onboardedUser(ctx.app, today);
    const b = await registerUser(ctx.app);
    const callB = as(ctx.app, b.cookie);
    const id = await newConversation(a.call);
    const res = await send(a.call, id, 'Como foi minha semana?');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    const ev = events(res);
    expect(ev.filter((e) => e.type === 'tool').map((e) => (e as { name: string }).name)).toEqual([
      'get_period_summary',
      'get_insights',
    ]);
    expect(ev.some((e) => e.type === 'text')).toBe(true);
    const done = ev.find((e) => e.type === 'done');
    expect(done).toMatchObject({
      message: { role: 'assistant', toolCalls: ['get_period_summary', 'get_insights'] },
    });

    const conv = await a.call({ method: 'GET', url: `/api/v1/ai/conversations/${id}` });
    const detail = conv.json<{ title: string; messages: { role: string; text: string }[] }>();
    expect(detail.title).toBe('Como foi minha semana?');
    expect(detail.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    const [row] = await ctx.handle.db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, id))
      .orderBy(aiMessages.createdAt)
      .offset(1);
    expect(row?.ungrounded).toEqual([]);

    // Segunda pergunta reenvia o histórico (só acrescentado).
    const second = await send(a.call, id, 'Como meu peso está evoluindo?');
    expect(events(second).find((e) => e.type === 'done')).toBeDefined();
    const list = await a.call({ method: 'GET', url: '/api/v1/ai/conversations' });
    expect(list.json<{ items: { id: string }[] }>().items.map((c) => c.id)).toContain(id);

    for (const r of await Promise.all([
      callB({ method: 'GET', url: `/api/v1/ai/conversations/${id}` }),
      send(callB, id, 'oi'),
      a.call({ method: 'GET', url: `/api/v1/ai/conversations/${MISSING}` }),
    ])) {
      expect(r.statusCode).toBe(404);
    }
    expect((await callB({ method: 'GET', url: '/api/v1/ai/conversations' })).json()).toEqual({
      items: [],
    });
    expect((await send(a.call, id, '')).statusCode).toBe(400);
  });

  it('meal proposal: apply creates the meal once; reject, expiry and isolation', async () => {
    const a = await onboardedUser(ctx.app, today);
    const b = await registerUser(ctx.app);
    const callB = as(ctx.app, b.cookie);
    const id = await newConversation(a.call);
    const res = await send(a.call, id, 'Registra no almoço: 200 g de arroz e 150 g de frango');
    const proposal = events(res).find(
      (e): e is { type: 'proposal'; proposal: ProposalDto } => e.type === 'proposal',
    );
    expect(proposal?.proposal).toMatchObject({
      actionType: 'log_meal',
      status: 'pending',
      link: '/nutricao',
    });
    expect(proposal?.proposal.summary).toMatch(/^Registrar almoço de \d{2}\/\d{2}: [\d.]+ kcal/);
    expect(proposal?.proposal.details).toHaveLength(2);
    const pid = proposal?.proposal.id ?? MISSING;
    // Nada gravado antes de aplicar.
    const before = await a.call({ method: 'GET', url: `/api/v1/meals?date=${today}` });
    expect(before.json<{ items: unknown[] }>().items).toHaveLength(0);
    // A conversa mostra o cartão na mensagem.
    const conv = await a.call({ method: 'GET', url: `/api/v1/ai/conversations/${id}` });
    expect(
      conv.json<{ messages: { proposals: { id: string }[] }[] }>().messages[1]?.proposals[0]?.id,
    ).toBe(pid);

    expect(
      (await callB({ method: 'POST', url: `/api/v1/ai/proposals/${pid}/accept` })).statusCode,
    ).toBe(404);
    const accepted = await a.call({ method: 'POST', url: `/api/v1/ai/proposals/${pid}/accept` });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json<ProposalDto>().status).toBe('accepted');
    const meals = await a.call({ method: 'GET', url: `/api/v1/meals?date=${today}` });
    const items = meals.json<{ items: { slot: string; status: string; items: unknown[] }[] }>()
      .items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ slot: 'lunch', status: 'logged' });
    expect(items[0]?.items).toHaveLength(2);
    const again = await a.call({ method: 'POST', url: `/api/v1/ai/proposals/${pid}/accept` });
    expect(again.statusCode).toBe(409);
    expect(again.json<{ code: string }>().code).toBe('PROPOSAL_NOT_PENDING');

    // Outra proposta: descartar; e uma terceira que expira.
    const r2 = events(await send(a.call, id, 'Registra no jantar: 100 g de feijão'));
    const p2 = (r2.find((e) => e.type === 'proposal') as { proposal: ProposalDto }).proposal.id;
    const rejected = await a.call({ method: 'POST', url: `/api/v1/ai/proposals/${p2}/reject` });
    expect(rejected.json<ProposalDto>().status).toBe('rejected');
    const r3 = events(await send(a.call, id, 'Registra no jantar: 100 g de arroz'));
    const p3 = (r3.find((e) => e.type === 'proposal') as { proposal: ProposalDto }).proposal.id;
    await ctx.handle.db
      .update(aiActionProposals)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(aiActionProposals.id, p3));
    expect(
      (await a.call({ method: 'POST', url: `/api/v1/ai/proposals/${p3}/accept` })).statusCode,
    ).toBe(409);
    const all = await a.call({ method: 'GET', url: '/api/v1/ai/proposals' });
    expect(
      all
        .json<{ items: ProposalDto[] }>()
        .items.map((p) => p.status)
        .sort(),
    ).toEqual(['accepted', 'expired', 'rejected']);
    expect(
      (await a.call({ method: 'GET', url: '/api/v1/ai/proposals?status=pending' })).json(),
    ).toEqual({ items: [] });
  });

  it('unknown foods become a tool error the model can explain', async () => {
    const a = await onboardedUser(ctx.app, today);
    const id = await newConversation(a.call);
    const ev = events(await send(a.call, id, 'Registra no almoço: 200 g de xpto inexistente'));
    expect(ev.some((e) => e.type === 'proposal')).toBe(false);
    expect(
      (ev.find((e) => e.type === 'done') as { message: { text: string } }).message.text,
    ).toContain('Não consegui consultar');
  });

  it('daily token limit returns 429 before streaming', async () => {
    const a = await onboardedUser(ctx.app, today);
    const id = await newConversation(a.call);
    await ctx.handle.db.insert(aiMessages).values({
      conversationId: id,
      userId: a.user.id,
      role: 'assistant',
      text: 'x',
      content: [],
      tokensIn: 150_000,
      tokensOut: 60_000,
    });
    const res = await send(a.call, id, 'Como foi minha semana?');
    expect(res.statusCode).toBe(429);
    expect(res.json<{ code: string }>().code).toBe('AI_DAILY_LIMIT');
    const status = await a.call({ method: 'GET', url: '/api/v1/ai/status' });
    expect(status.json<{ tokensToday: number }>().tokensToday).toBe(210_000);
  });
});

describe('coach proposals for goal, swap and workout adaptation', () => {
  let plan: Call[] = [];
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp({ aiModelChat: 'test' }, undefined, {
      coachTransport: toolsThenText(
        () => plan,
        (results) =>
          results.some((r) => r.includes('proposalCreated')) ? 'Proposta pronta.' : 'Não deu.',
      ),
    });
  });
  afterAll(() => ctx.close());

  async function proposalFor(call: ReturnType<typeof as>, calls: Call[]) {
    plan = calls;
    const id = await newConversation(call);
    const ev = events(await send(call, id, 'faça'));
    return ev.find((e) => e.type === 'proposal') as { proposal: ProposalDto } | undefined;
  }

  it('goal update respects the safety locks and applies a new goal version', async () => {
    const u = await onboardedUser(ctx.app, today);
    // Ganho de 1,4%/semana em perda de gordura: inválido pelas regras do objetivo.
    const bad = await proposalFor(u.call, [
      {
        name: 'propose_goal_update',
        input: { primary_goal: 'fat_loss', target_rate_pct_per_week: 1.4 },
      },
    ]);
    expect(bad).toBeUndefined();
    const ok = await proposalFor(u.call, [
      {
        name: 'propose_goal_update',
        input: { primary_goal: 'maintenance', target_rate_pct_per_week: null },
      },
    ]);
    expect(ok?.proposal.summary).toMatch(
      /^Mudar objetivo para manutenção: meta média de [\d.]+ → [\d.]+ kcal$/,
    );
    const res = await u.call({
      method: 'POST',
      url: `/api/v1/ai/proposals/${ok?.proposal.id ?? MISSING}/accept`,
    });
    expect(res.statusCode).toBe(200);
    const goals = await u.call({ method: 'GET', url: '/api/v1/goals' });
    expect(
      goals.json<{ items: { primaryGoal: string }[] }>().items.map((g) => g.primaryGoal),
    ).toContain('maintenance');
  });

  it('exercise swap goes through the validator and updates the active program', async () => {
    const u = await onboardedUser(ctx.app, today);
    await u.call({
      method: 'PUT',
      url: '/api/v1/availability',
      payload: { items: [1, 3, 5].map((weekday) => ({ weekday, maxMinutes: 60, kind: 'gym' })) },
    });
    const draft = (
      await u.call({ method: 'POST', url: '/api/v1/programs/generate', payload: {} })
    ).json<{
      program: { templates: { exercises: { exerciseId: string }[] }[] };
    }>();
    const created = await u.call({
      method: 'POST',
      url: '/api/v1/programs',
      payload: { ...draft.program, activate: true },
    });
    const program = created.json<{
      id: string;
      templates: { exercises: { exerciseId: string; exerciseName: string }[] }[];
    }>();
    const from = program.templates[0]?.exercises[0];
    expect(from).toBeDefined();
    const swap = await proposalFor(u.call, [
      {
        name: 'propose_exercise_swap',
        input: { from_exercise: from?.exerciseName ?? '', to_exercise: 'Rosca direta com barra' },
      },
    ]);
    expect(swap?.proposal.summary).toContain('por Rosca direta com barra');
    const res = await u.call({
      method: 'POST',
      url: `/api/v1/ai/proposals/${swap?.proposal.id ?? MISSING}/accept`,
    });
    expect(res.statusCode).toBe(200);
    const after = await u.call({ method: 'GET', url: `/api/v1/programs/${program.id}` });
    const names = after
      .json<{ templates: { exercises: { exerciseName: string }[] }[] }>()
      .templates.flatMap((t) => t.exercises.map((e) => e.exerciseName));
    expect(names).toContain('Rosca direta com barra');
    expect(names).not.toContain(from?.exerciseName);
  });

  it('workout adaptation is recomputed by the rules and marks the planned workout', async () => {
    const u = await onboardedUser(ctx.app, today);
    await u.call({
      method: 'PUT',
      url: '/api/v1/availability',
      payload: {
        items: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, maxMinutes: 60, kind: 'gym' })),
      },
    });
    const draft = (
      await u.call({ method: 'POST', url: '/api/v1/programs/generate', payload: {} })
    ).json<{
      program: Record<string, unknown>;
    }>();
    await u.call({
      method: 'POST',
      url: '/api/v1/programs',
      payload: { ...draft.program, activate: true },
    });
    // Sem check-in ruim: nada a adaptar → erro de ferramenta, sem proposta.
    const none = await proposalFor(u.call, [
      { name: 'propose_workout_adaptation', input: { date: today, reason: 'dormi mal' } },
    ]);
    expect(none).toBeUndefined();
    await u.call({
      method: 'PUT',
      url: `/api/v1/checkins/${today}`,
      payload: { sleepHours: 4, sleepQuality: 1, energy: 2, stress: 4, fatigue: 4, soreness: 3 },
    });
    const p = await proposalFor(u.call, [
      { name: 'propose_workout_adaptation', input: { date: today, reason: 'dormi mal' } },
    ]);
    expect(p?.proposal.summary).toMatch(
      /^Adaptar .+ de \d{2}\/\d{2}: (volume reduzido|sessão leve)$/,
    );
    const res = await u.call({
      method: 'POST',
      url: `/api/v1/ai/proposals/${p?.proposal.id ?? MISSING}/accept`,
    });
    expect(res.statusCode).toBe(200);
    const planned = await u.call({
      method: 'GET',
      url: `/api/v1/planned-workouts?from=${today}&to=${today}`,
    });
    expect(planned.json<{ items: { status: string }[] }>().items[0]?.status).toBe('adapted');
  });

  it('weekly summary accepts grounded AI text', async () => {
    const u = await onboardedUser(ctx.app, today);
    // O transporte deste bloco responde ao resumo sem ferramentas: texto sem números.
    const refresh = await u.call({ method: 'POST', url: '/api/v1/ai/weekly-summary/refresh' });
    expect(refresh.statusCode).toBe(200);
    expect(['ai', 'template']).toContain(refresh.json<{ source: string }>().source);
  });
});

describe('coach review fixes (ADR-057)', () => {
  let impl: CoachTransport = () => Promise.reject(new Error('unset'));
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp({ aiModelChat: 'test' }, undefined, {
      coachTransport: (p, onText, signal) => impl(p, onText, signal),
    });
  });
  afterAll(() => ctx.close());

  it('one turn per user at a time', async () => {
    const u = await onboardedUser(ctx.app, today);
    const id = await newConversation(u.call);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    impl = async (_p, onText) => {
      await gate;
      onText('ok');
      return message([{ type: 'text', text: 'ok' }], 'end_turn');
    };
    const first = send(u.call, id, 'primeira');
    await new Promise((r) => setTimeout(r, 200));
    const second = await send(u.call, id, 'segunda');
    expect(second.statusCode).toBe(429);
    expect(second.json<{ code: string }>().code).toBe('RATE_LIMITED');
    release();
    expect((await first).statusCode).toBe(200);
    // Liberado depois do turno.
    expect((await send(u.call, id, 'terceira')).statusCode).toBe(200);
  });

  it('a failed turn records the spent tokens and keeps the history valid', async () => {
    const u = await onboardedUser(ctx.app, today);
    const id = await newConversation(u.call);
    let calls = 0;
    impl = (params, onText) => {
      calls += 1;
      if (calls === 1)
        return Promise.resolve(
          message(
            [{ type: 'tool_use', id: 't0', name: 'get_insights', input: { status: null } }],
            'tool_use',
          ),
        );
      if (calls === 2) return Promise.reject(new Error('overloaded'));
      // Turno seguinte: o histórico precisa alternar usuário/assistente.
      const roles = params.messages.map((m) => m.role);
      const alternates = roles.every((r, i) => i === 0 || r !== roles[i - 1]);
      const t = alternates ? 'alterna' : 'quebrado';
      onText(t);
      return Promise.resolve(message([{ type: 'text', text: t }], 'end_turn'));
    };
    const failed = events(await send(u.call, id, 'oi'));
    expect(failed.at(-1)).toMatchObject({ type: 'error', code: 'AI_ERROR' });
    const status = await u.call({ method: 'GET', url: '/api/v1/ai/status' });
    expect(status.json<{ tokensToday: number }>().tokensToday).toBe(15);
    const ok = events(await send(u.call, id, 'de novo'));
    expect((ok.find((e) => e.type === 'done') as { message: { text: string } }).message.text).toBe(
      'alterna',
    );
  });

  it('reject or expiry never touch a proposal being applied', async () => {
    const u = await onboardedUser(ctx.app, today);
    impl = toolsThenText(
      () => [
        {
          name: 'propose_goal_update',
          input: { primary_goal: 'maintenance', target_rate_pct_per_week: null },
        },
      ],
      () => 'Proposta pronta.',
    );
    const id = await newConversation(u.call);
    const p = (
      events(await send(u.call, id, 'muda')).find((e) => e.type === 'proposal') as {
        proposal: ProposalDto;
      }
    ).proposal;
    // Simula uma aplicação em andamento (trava).
    await ctx.handle.db
      .update(aiActionProposals)
      .set({ resolvedAt: new Date(), expiresAt: new Date(Date.now() - 1000) })
      .where(eq(aiActionProposals.id, p.id));
    const rej = await u.call({ method: 'POST', url: `/api/v1/ai/proposals/${p.id}/reject` });
    expect(rej.statusCode).toBe(409);
    const list = await u.call({ method: 'GET', url: '/api/v1/ai/proposals' });
    expect(list.json<{ items: ProposalDto[] }>().items[0]?.status).toBe('pending');
  });
});
