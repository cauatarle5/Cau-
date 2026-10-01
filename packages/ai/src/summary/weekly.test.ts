import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';

import { templateWeeklySummary, writeWeeklySummary, type WeeklySummaryData } from './weekly';

const data: WeeklySummaryData = {
  weekStart: '2026-09-21',
  weekEnd: '2026-09-27',
  summary: {
    training: { sessions: 4, adherencePct: 80, tonnage: 41230 },
    nutrition: { completeDays: 6, avgKcal: 2138, avgProteinG: 164 },
    body: { changeKg: -0.42, endTrendKg: 80.3 },
    recovery: { avgSleepHours: 6.9, avgReadiness: 71 },
  },
  insights: [{ title: 'Proteína abaixo da meta nos dias de treino', body: '...' }],
};

const reply =
  (text: string, stop: Anthropic.Beta.BetaStopReason = 'end_turn') =>
  () =>
    Promise.resolve({
      content: [{ type: 'text', text }],
      stop_reason: stop,
    } as unknown as Anthropic.Beta.BetaMessage);

describe('weekly summary (ADR-056)', () => {
  it('template uses only the data', () => {
    expect(templateWeeklySummary(data)).toBe(
      'Na semana de 21/09 a 27/09: 4 treino(s), 80% dos agendados. Alimentação: 6 dia(s) completos, média de 2.138 kcal e 164 g de proteína. Tendência de peso caiu 0,4 kg. Sono médio de 6,9 h. Destaque: proteína abaixo da meta nos dias de treino.',
    );
  });

  it('accepts AI text whose numbers are grounded', async () => {
    const text = 'Semana de 21/09: **4** treinos e média de **2.138 kcal**; peso caiu 0,42 kg.';
    const r = await writeWeeklySummary({ data, transport: reply(text), model: 'm' });
    expect(r).toEqual({ text, source: 'ai', model: 'm' });
  });

  it('falls back to the template on invented numbers, errors or no model', async () => {
    const invented = await writeWeeklySummary({
      data,
      transport: reply('Você comeu 2.500 kcal por dia.'),
      model: 'm',
    });
    expect(invented.source).toBe('template');
    const failing = await writeWeeklySummary({
      data,
      transport: () => Promise.reject(new Error('down')),
      model: 'm',
    });
    expect(failing.source).toBe('template');
    const none = await writeWeeklySummary({ data, transport: null, model: null });
    expect(none.source).toBe('template');
    const cut = await writeWeeklySummary({
      data,
      transport: reply('Semana boa', 'max_tokens'),
      model: 'm',
    });
    expect(cut.source).toBe('template');
  });
});
