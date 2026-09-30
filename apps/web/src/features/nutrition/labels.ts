import type { DayTypeDto, FoodUnitDto, MealSlot } from '@atlas/schemas';

export const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Café da manhã',
  morning_snack: 'Lanche da manhã',
  lunch: 'Almoço',
  afternoon_snack: 'Lanche da tarde',
  pre_workout: 'Pré-treino',
  post_workout: 'Pós-treino',
  dinner: 'Jantar',
  supper: 'Ceia',
  other: 'Outra',
};

export const DAY_TYPE_LABELS: Record<DayTypeDto, string> = {
  rest: 'Descanso',
  training: 'Treino',
  hard_training: 'Treino pesado',
  sport: 'Esporte',
  sport_and_training: 'Esporte + treino',
};

export const UNIT_LABELS: Record<FoodUnitDto, string> = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'litro',
  unit: 'unidade',
  slice: 'fatia',
  tbsp: 'colher de sopa',
  tsp: 'colher de chá',
  cup: 'xícara',
  scoop: 'scoop',
  ladle: 'concha',
  portion: 'porção',
  pinch: 'pitada',
  glass: 'copo',
  can: 'lata',
  small: 'pequeno(a)',
  medium: 'médio(a)',
  large: 'grande',
};
