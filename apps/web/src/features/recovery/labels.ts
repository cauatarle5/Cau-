import type { ReadinessDto } from '@atlas/schemas';

export const DRIVER_LABELS: Record<ReadinessDto['drivers'][number], string> = {
  sleep: 'sono ruim',
  energy: 'pouca disposição',
  fatigue: 'fadiga alta',
  soreness: 'dor muscular',
  stress: 'estresse alto',
  high_acwr: 'pico de carga na semana',
  sport_yesterday: 'esporte intenso ontem',
};

export const BAND_LABELS: Record<ReadinessDto['band'], string> = {
  green: 'Pronto para treinar',
  yellow: 'Atenção: treino moderado',
  red: 'Recuperação: treino leve',
  unknown: 'Sem check-in',
};

export const BAND_CLASSES: Record<ReadinessDto['band'], string> = {
  green: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100',
  yellow: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
  red: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100',
  unknown: 'bg-muted text-muted-foreground',
};

export const CHECKIN_FIELDS = [
  { key: 'sleepQuality', label: 'Qualidade do sono', low: 'Péssima', high: 'Ótima' },
  { key: 'energy', label: 'Disposição', low: 'Baixa', high: 'Alta' },
  { key: 'stress', label: 'Estresse', low: 'Baixo', high: 'Alto' },
  { key: 'fatigue', label: 'Fadiga', low: 'Baixa', high: 'Alta' },
  { key: 'soreness', label: 'Dor muscular', low: 'Nenhuma', high: 'Muita' },
] as const;

export const PAIN_REGION_LABELS = {
  shoulder: 'Ombro',
  elbow: 'Cotovelo',
  wrist: 'Punho',
  lower_back: 'Lombar',
  hip: 'Quadril',
  knee: 'Joelho',
  ankle: 'Tornozelo',
  neck: 'Pescoço',
  other: 'Outra',
} as const;

export const DEMAND_LABELS = { 1: 'Baixa', 2: 'Média', 3: 'Alta' } as const;
