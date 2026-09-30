import type { FoodUnit } from '@atlas/core';

/** Frases com gabarito para `pnpm ai:eval` (subconjunto inicial; 100 frases na Fase 7). */
export const PARSER_EVAL_CASES: readonly {
  text: string;
  items: [string, number, FoodUnit | null][];
}[] = [
  {
    text: '200g de arroz, 150g de frango e 100g de feijão',
    items: [
      ['arroz', 200, 'g'],
      ['frango', 150, 'g'],
      ['feijao', 100, 'g'],
    ],
  },
  {
    text: '2 ovos e 1 pão francês',
    items: [
      ['ovos', 2, null],
      ['pao frances', 1, null],
    ],
  },
  { text: '1 concha de feijão', items: [['feijao', 1, 'ladle']] },
  { text: 'whey 1 scoop', items: [['whey', 1, 'scoop']] },
  { text: 'duas bananas', items: [['bananas', 2, null]] },
  { text: 'meia xícara de aveia', items: [['aveia', 0.5, 'cup']] },
  { text: '300 ml de leite', items: [['leite', 300, 'ml']] },
  { text: '2 fatias de pão de forma', items: [['pao de forma', 2, 'slice']] },
  { text: '3 colheres de sopa de arroz', items: [['arroz', 3, 'tbsp']] },
  { text: '1 banana média', items: [['banana', 1, 'medium']] },
  { text: '150 gramas de carne moída', items: [['carne moida', 150, 'g']] },
  {
    text: '30g de aveia, 1 banana e 200ml de leite',
    items: [
      ['aveia', 30, 'g'],
      ['banana', 1, null],
      ['leite', 200, 'ml'],
    ],
  },
  { text: '1 copo de suco de laranja', items: [['suco de laranja', 1, 'glass']] },
  { text: '100g de batata doce', items: [['batata doce', 100, 'g']] },
  { text: '1 lata de atum', items: [['atum', 1, 'can']] },
  { text: 'três ovos cozidos', items: [['ovos cozidos', 3, null]] },
  { text: '1 colher de chá de açúcar', items: [['acucar', 1, 'tsp']] },
  { text: '250 g de filé de tilápia', items: [['file de tilapia', 250, 'g']] },
  { text: '120g de macarrão', items: [['macarrao', 120, 'g']] },
  { text: '1 iogurte natural', items: [['iogurte natural', 1, null]] },
];
