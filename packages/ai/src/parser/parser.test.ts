import { describe, expect, it, vi } from 'vitest';

import { createFoodParser, type MessagesParseClient } from './index';

function fakeClient(impl: () => Promise<unknown>): MessagesParseClient {
  return {
    messages: { parse: vi.fn(impl) as unknown as MessagesParseClient['messages']['parse'] },
  };
}

const text = '200g de arroz e 2 ovos';

describe('createFoodParser', () => {
  it('uses rules when no model is configured', async () => {
    const parser = createFoodParser({});
    expect(parser.enabled).toBe(false);
    const r = await parser.parse(text);
    expect(r.source).toBe('rules');
    expect(r.items.map((i) => [i.foodQuery, i.quantity, i.unit])).toEqual([
      ['arroz', 200, 'g'],
      ['ovos', 2, null],
    ]);
  });

  it('maps a valid AI response (no nutrients involved)', async () => {
    const client = fakeClient(() =>
      Promise.resolve({
        stop_reason: 'end_turn',
        parsed_output: {
          items: [
            {
              raw: '200g de arroz',
              food_query: 'Arroz',
              quantity: 200,
              unit: 'g',
              preparation: null,
              brand: null,
            },
            {
              raw: '2 ovos',
              food_query: 'ovos',
              quantity: 2,
              unit: null,
              preparation: null,
              brand: null,
            },
          ],
        },
      }),
    );
    const parser = createFoodParser({ model: 'test-model', client });
    const r = await parser.parse(text);
    expect(r.source).toBe('ai');
    expect(r.items[0]).toEqual({
      raw: '200g de arroz',
      foodQuery: 'arroz',
      quantity: 200,
      unit: 'g',
      preparation: null,
    });
  });

  it.each([
    ['API error', () => Promise.reject(new Error('boom'))],
    ['refusal', () => Promise.resolve({ stop_reason: 'refusal', parsed_output: null })],
    ['unparseable output', () => Promise.resolve({ stop_reason: 'end_turn', parsed_output: null })],
    [
      'empty items',
      () => Promise.resolve({ stop_reason: 'end_turn', parsed_output: { items: [] } }),
    ],
  ])('falls back to rules on %s', async (_, impl) => {
    const onError = vi.fn();
    const parser = createFoodParser({ model: 'test-model', client: fakeClient(impl), onError });
    const r = await parser.parse(text);
    expect(r.source).toBe('rules');
    expect(r.items).toHaveLength(2);
  });

  it('passes the configured model and timeout, never a hardcoded model', async () => {
    const client = fakeClient(() =>
      Promise.resolve({ stop_reason: 'end_turn', parsed_output: { items: [] } }),
    );
    await createFoodParser({ model: 'from-env', client, timeoutMs: 1234 }).parse(text);
    const call = (
      client.messages.parse as unknown as {
        mock: { calls: [{ model: string }, { timeout: number }][] };
      }
    ).mock.calls[0];
    expect(call?.[0].model).toBe('from-env');
    expect(call?.[1].timeout).toBe(1234);
  });
});
