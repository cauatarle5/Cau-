import { describe, expect, it } from 'vitest';

import { normalizeForSearch, normalizeMealText } from './normalize';
import { parseMealText } from './parser';
import type { FoodUnit } from './units';

type Expect = [query: string, quantity: number, unit: FoodUnit | null];

/** Tabela de frases (P13: ≥ 60). Cada linha: texto → itens esperados. */
const CASES: [string, Expect[]][] = [
  [
    '200g de arroz, 150g de frango e 100g de feijão',
    [
      ['arroz', 200, 'g'],
      ['frango', 150, 'g'],
      ['feijao', 100, 'g'],
    ],
  ],
  [
    '2 ovos e 1 pão francês com requeijão',
    [
      ['ovos', 2, null],
      ['pao frances com requeijao', 1, null],
    ],
  ],
  ['1 concha de feijão', [['feijao', 1, 'ladle']]],
  ['whey 1 scoop', [['whey', 1, 'scoop']]],
  ['duas bananas', [['bananas', 2, null]]],
  ['meia xícara de aveia', [['aveia', 0.5, 'cup']]],
  ['1,5 kg de melancia', [['melancia', 1.5, 'kg']]],
  ['uma e meia colher de sopa de azeite', [['azeite', 1.5, 'tbsp']]],
  ['300 ml de leite', [['leite', 300, 'ml']]],
  ['1 litro de água', [['agua', 1, 'l']]],
  ['2 fatias de pão de forma', [['pao de forma', 2, 'slice']]],
  ['3 colheres de arroz', [['arroz', 3, 'tbsp']]],
  ['2 colheres de sopa cheias de arroz', [['arroz', 2, 'tbsp']]],
  ['1 colher de chá de açúcar', [['acucar', 1, 'tsp']]],
  ['1 colherzinha de mel', [['mel', 1, 'tsp']]],
  ['1 banana média', [['banana', 1, 'medium']]],
  ['1 maçã grande', [['maca', 1, 'large']]],
  ['1 laranja pequena', [['laranja', 1, 'small']]],
  ['1 copo de suco de laranja', [['suco de laranja', 1, 'glass']]],
  ['1 lata de atum', [['atum', 1, 'can']]],
  ['1 pitada de sal', [['sal', 1, 'pinch']]],
  ['1 porção de batata frita', [['batata frita', 1, 'portion']]],
  ['arroz 200g', [['arroz', 200, 'g']]],
  ['frango grelhado 150 g', [['frango grelhado', 150, 'g']]],
  ['150 gramas de carne moída', [['carne moida', 150, 'g']]],
  ['100gr de batata doce', [['batata doce', 100, 'g']]],
  ['2 unidades de pão de queijo', [['pao de queijo', 2, 'unit']]],
  ['3 un de biscoito', [['biscoito', 3, 'unit']]],
  ['1 iogurte', [['iogurte', 1, null]]],
  ['café com açúcar', [['cafe com acucar', 1, null]]],
  [
    'arroz e feijão',
    [
      ['arroz', 1, null],
      ['feijao', 1, null],
    ],
  ],
  [
    '200g arroz + 100g feijão',
    [
      ['arroz', 200, 'g'],
      ['feijao', 100, 'g'],
    ],
  ],
  [
    '200g de arroz; 100g de feijão',
    [
      ['arroz', 200, 'g'],
      ['feijao', 100, 'g'],
    ],
  ],
  [
    '200g de arroz\n150g de frango',
    [
      ['arroz', 200, 'g'],
      ['frango', 150, 'g'],
    ],
  ],
  ['1/2 mamão papaia', [['mamao papaia', 0.5, null]]],
  ['2 e meio kg de carne', [['carne', 2.5, 'kg']]],
  ['meia dúzia de ovos', [['ovos', 6, null]]],
  ['três ovos cozidos', [['ovos cozidos', 3, null]]],
  ['quatro torradas', [['torradas', 4, null]]],
  ['cinco castanhas', [['castanhas', 5, null]]],
  ['dez morangos', [['morangos', 10, null]]],
  ['1 xícara de leite', [['leite', 1, 'cup']]],
  ['2 xícaras de café', [['cafe', 2, 'cup']]],
  ['1 concha média de feijão', [['feijao', 1, 'ladle']]],
  ['2 conchas de sopa de legumes', [['sopa de legumes', 2, 'ladle']]],
  ['1 fatia de queijo mussarela', [['queijo mussarela', 1, 'slice']]],
  ['2 fatias finas de presunto', [['presunto', 2, 'slice']]],
  ['1 scoop de whey', [['whey', 1, 'scoop']]],
  ['2 medidas de whey protein', [['whey protein', 2, 'scoop']]],
  [
    '30g de aveia, 1 banana e 200ml de leite',
    [
      ['aveia', 30, 'g'],
      ['banana', 1, null],
      ['leite', 200, 'ml'],
    ],
  ],
  ['1 pão francês', [['pao frances', 1, null]]],
  ['2 pães franceses', [['paes franceses', 2, null]]],
  ['1 tapioca', [['tapioca', 1, null]]],
  ['100g de mandioca cozida', [['mandioca cozida', 100, 'g']]],
  ['120g de macarrão', [['macarrao', 120, 'g']]],
  ['10 ml de azeite', [['azeite', 10, 'ml']]],
  ['1 colher de sopa de azeite', [['azeite', 1, 'tbsp']]],
  ['1 colher de pasta de amendoim', [['pasta de amendoim', 1, 'tbsp']]],
  ['1 copo americano de leite', [['leite', 1, 'glass']]],
  ['0.5 abacate', [['abacate', 0.5, null]]],
  ['1,5 xícara de arroz', [['arroz', 1.5, 'cup']]],
  ['250 g de filé de tilápia', [['file de tilapia', 250, 'g']]],
  [
    'Salada de alface e tomate',
    [
      ['salada de alface', 1, null],
      ['tomate', 1, null],
    ],
  ],
  ['1 prato de salada', [['prato de salada', 1, null]]],
  ['  ', []],
];

describe('parseMealText (rule-based, P6.2 step 3)', () => {
  it('has at least 60 phrases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(60);
  });

  it.each(CASES)('%s', (text, expected) => {
    const items = parseMealText(text);
    expect(items.map((i) => [i.foodQuery, i.quantity, i.unit])).toEqual(expected);
  });

  it('keeps the raw segment and extracts preparation', () => {
    const [item] = parseMealText('150g de frango grelhado');
    expect(item).toMatchObject({ raw: '150g de frango grelhado', preparation: 'grelhado' });
  });
});

describe('normalization', () => {
  it('removes accents and lowercases for search', () => {
    expect(normalizeForSearch('  Pão  Francês ')).toBe('pao frances');
  });
  it('converts decimal comma and number words, keeping item commas', () => {
    expect(normalizeMealText('1,5 kg de arroz, duas bananas')).toBe('1.5 kg de arroz, 2 bananas');
  });
});
