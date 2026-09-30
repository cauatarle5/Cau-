import type { HouseholdUnit } from '@atlas/core';

/** Medidas genéricas (sem alimento) usadas quando o alimento não tem medida própria. */
export const GENERIC_MEASURES: readonly {
  unitCode: HouseholdUnit;
  labelPt: string;
  grams: number;
}[] = [
  { unitCode: 'tbsp', labelPt: 'colher de sopa', grams: 15 },
  { unitCode: 'tsp', labelPt: 'colher de chá', grams: 5 },
  { unitCode: 'cup', labelPt: 'xícara (240 ml)', grams: 240 },
  { unitCode: 'glass', labelPt: 'copo (200 ml)', grams: 200 },
  { unitCode: 'pinch', labelPt: 'pitada', grams: 0.5 },
];

/** Medidas específicas por alimento TACO (exemplos da P4.5). */
export const FOOD_MEASURES: readonly {
  tacoName: string;
  unitCode: HouseholdUnit;
  labelPt: string;
  grams: number;
  isDefault?: boolean;
}[] = [
  {
    tacoName: 'Ovo, de galinha, inteiro, cozido/10minutos',
    unitCode: 'unit',
    labelPt: '1 unidade',
    grams: 50,
    isDefault: true,
  },
  {
    tacoName: 'Ovo, de galinha, inteiro, frito',
    unitCode: 'unit',
    labelPt: '1 unidade',
    grams: 50,
    isDefault: true,
  },
  {
    tacoName: 'Ovo, de galinha, inteiro, cru',
    unitCode: 'unit',
    labelPt: '1 unidade',
    grams: 50,
    isDefault: true,
  },
  {
    tacoName: 'Pão, trigo, francês',
    unitCode: 'unit',
    labelPt: '1 unidade',
    grams: 50,
    isDefault: true,
  },
  {
    tacoName: 'Arroz, tipo 1, cozido',
    unitCode: 'tbsp',
    labelPt: 'colher de sopa cheia',
    grams: 25,
  },
  {
    tacoName: 'Arroz, integral, cozido',
    unitCode: 'tbsp',
    labelPt: 'colher de sopa cheia',
    grams: 25,
  },
  { tacoName: 'Feijão, carioca, cozido', unitCode: 'ladle', labelPt: 'concha média', grams: 86 },
  { tacoName: 'Feijão, preto, cozido', unitCode: 'ladle', labelPt: 'concha média', grams: 86 },
  {
    tacoName: 'Pão, trigo, forma, integral',
    unitCode: 'slice',
    labelPt: '1 fatia',
    grams: 25,
    isDefault: true,
  },
  {
    tacoName: 'Banana, prata, crua',
    unitCode: 'medium',
    labelPt: '1 média',
    grams: 70,
    isDefault: true,
  },
];
