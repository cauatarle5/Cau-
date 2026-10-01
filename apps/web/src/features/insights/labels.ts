import type { DailyContextDto, InsightDto } from '@atlas/schemas';

export const SEVERITY_LABELS: Record<InsightDto['severity'], string> = {
  warning: 'Alerta',
  attention: 'Atenção',
  info: 'Info',
};

export const SEVERITY_CLASSES: Record<InsightDto['severity'], string> = {
  warning: 'border-l-destructive',
  attention: 'border-l-amber-500',
  info: 'border-l-primary',
};

export const FLAG_LABELS: Record<DailyContextDto['flags'][number], string> = {
  LOW_PROTEIN_TODAY: 'Proteína prevista abaixo da meta',
  SPORT_YESTERDAY: 'Esporte ontem',
  POOR_SLEEP: 'Noite ruim',
  HIGH_ACWR: 'Pico de carga',
};
