import { describe, expect, it } from 'vitest';

import { collectSourceValues, extractDates, extractNumbers, groundedNumbers } from './numbers';

describe('extractNumbers (pt-BR)', () => {
  it('thousands, decimals, signs and units', () => {
    expect(extractNumbers('Média de 1.234,5 kcal e −0,43% por semana; 12 séries.')).toEqual([
      { raw: '1.234,5', value: 1234.5, decimals: 1, unit: 'kcal' },
      { raw: '−0,43', value: -0.43, decimals: 2, unit: '%' },
      { raw: '12', value: 12, decimals: 0, unit: null },
    ]);
    // Unidade colada ao número.
    expect(
      extractNumbers('pesou 80kg, comeu 2300kcal e perdeu 3,5kg').map((n) => [n.value, n.unit]),
    ).toEqual([
      [80, 'kg'],
      [2300, 'kcal'],
      [3.5, 'kg'],
    ]);
    expect(extractNumbers('faixa 6–10 reps, 80 kg').map((n) => n.value)).toEqual([6, 10, 80]);
    expect(extractNumbers('versão 2.5 do app').map((n) => n.value)).toEqual([2.5]);
    expect(extractNumbers('Superior A e treino B2').map((n) => n.value)).toEqual([]);
  });

  it('dates are separate', () => {
    expect(extractNumbers('em 21/09 e 05/10/2026')).toEqual([]);
    expect(extractDates('em 21/09 e 05/10/2026')).toEqual([
      { raw: '21/09', monthDay: '09-21' },
      { raw: '05/10/2026', monthDay: '10-05' },
    ]);
  });
});

describe('groundedNumbers (ADR-055)', () => {
  const tool = {
    summary: { body: { changeKg: -4.32, ratePctPerWeek: -0.43 }, nutrition: { avgKcal: 2138 } },
    adherence: 0.754,
    proteinG: 164000 / 1000,
    insight: 'Em 3 dos últimos 5 dias a proteína ficou em 56% da meta.',
    from: '2026-09-21',
  };

  it('accepts numbers present in the sources, rounded as displayed', () => {
    const r = groundedNumbers(
      'Nos últimos 7 dias (desde 21/09) seu peso caiu 4,3 kg (−0,43%/semana), com média de 2.138 kcal, aderência de 75% e 164 g de proteína; proteína em 56% da meta.',
      [tool],
    );
    expect(r).toEqual({ ok: true, ungrounded: [], checked: 7 });
  });

  it('unit conversions only when the written unit asks for them', () => {
    // 70 kg não é 0,07 × 1000; 7% é 0,07 × 100.
    expect(groundedNumbers('Você pesa 70 kg.', [{ changePct: 0.07 }]).ok).toBe(false);
    expect(groundedNumbers('Subiu 7% no período.', [{ changePct: 0.07 }]).ok).toBe(true);
    expect(groundedNumbers('Comeu 164 g de proteína', [{ proteinKg: 0.164 }]).ok).toBe(true);
    // Colado e inventado: sinalizado.
    expect(groundedNumbers('Você pesa 80kg e perdeu 3,5kg', [{ weightKg: 80 }]).ungrounded).toEqual(
      ['3,5'],
    );
    // Sem truncamento: 79,6 kg não vira "80" nem "79" por proximidade, só por arredondamento.
    expect(groundedNumbers('Tendência de 80 kg', [{ trendKg: 79.6 }]).ok).toBe(true);
    expect(groundedNumbers('Tendência de 79 kg', [{ trendKg: 79.6 }]).ok).toBe(false);
  });

  it('negative halves round away from zero, like Intl', () => {
    expect(groundedNumbers('Tendência: -0,4 kg.', [{ changeKg: -0.35 }]).ok).toBe(true);
    expect(groundedNumbers('Tendência: −0,3 kg.', [{ changeKg: -0.35 }]).ok).toBe(false);
  });

  it('flags invented numbers and dates', () => {
    const r = groundedNumbers('Você ganhou 2,5 kg e comeu 2.400 kcal em 22/09.', [tool]);
    expect(r.ok).toBe(false);
    expect(r.ungrounded).toEqual(['2,5', '2.400', '22/09']);
  });

  it('ignores small counts and numbers from the question', () => {
    const r = groundedNumbers('Em 3 treinos e nos 14 dias que você pediu.', [tool], {
      ignoreText: 'como foram os últimos 14 dias?',
    });
    expect(r).toEqual({ ok: true, ungrounded: [], checked: 0 });
  });

  it('collectSourceValues walks JSON and text', () => {
    const v = collectSourceValues([{ a: [1.5, { b: 'tem 1.200 kcal em 2026-03-02' }] }]);
    expect(v.numbers).toEqual([1.5, 1200]);
    expect([...v.monthDays]).toEqual(['03-02']);
  });
});
