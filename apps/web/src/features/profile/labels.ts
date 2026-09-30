/** Rótulos pt-BR dos enums (interface em português). */
export const GOAL_LABELS = {
  fat_loss: 'Perder gordura',
  maintenance: 'Manter',
  muscle_gain: 'Ganhar massa',
  recomposition: 'Recomposição',
  performance: 'Performance',
} as const;

export const GOAL_HINTS = {
  fat_loss: 'Déficit moderado, preservando massa magra.',
  maintenance: 'Peso estável, foco em saúde e treino.',
  muscle_gain: 'Superávit leve para ganhar massa.',
  recomposition: 'Peso estável, cintura caindo e força subindo.',
  performance: 'Energia para treinar e competir bem.',
} as const;

export const LIFESTYLE_LABELS = {
  sedentary: 'Sedentário',
  light: 'Levemente ativo',
  moderate: 'Moderadamente ativo',
  high: 'Muito ativo',
} as const;

export const LIFESTYLE_HINTS = {
  sedentary: 'Trabalho sentado, poucos passos fora do treino.',
  light: 'Caminha um pouco no dia a dia.',
  moderate: 'Em pé boa parte do dia ou muitos passos.',
  high: 'Trabalho físico pesado.',
} as const;

export const EXPERIENCE_LABELS = {
  beginner: 'Iniciante',
  intermediate: 'Intermediário',
  advanced: 'Avançado',
} as const;

export const SPORT_LABELS = {
  football: 'Futebol',
  futsal: 'Futsal',
  running: 'Corrida',
  cycling: 'Ciclismo',
  swimming: 'Natação',
  other: 'Outro',
} as const;

export const BODY_FAT_METHOD_LABELS = {
  bioimpedance: 'Bioimpedância',
  skinfold: 'Dobras cutâneas',
  dexa: 'DEXA',
  visual: 'Estimativa visual',
  other: 'Outro',
} as const;

export const EXERCISE_KIND_LABELS: Record<string, string> = {
  strength: 'Musculação',
  ...SPORT_LABELS,
};

export const LOCK_LABELS = {
  MAX_DEFICIT: 'Déficit limitado a 25% do gasto total.',
  MIN_BMR: 'Calorias nunca abaixo da sua taxa metabólica basal.',
  MIN_ABSOLUTE: 'Calorias nunca abaixo do mínimo seguro (1500 homens / 1200 mulheres).',
} as const;
