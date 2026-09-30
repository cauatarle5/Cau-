export const RECORD_LABELS: Record<string, string> = {
  e1rm: 'e1RM',
  max_load: 'maior carga',
  rep_at_load: 'mais reps na carga',
  volume_session: 'tonelagem',
};

export const VOLUME_STATUS_LABELS: Record<string, string> = {
  below_mev: 'abaixo do mínimo',
  minimum: 'mínimo',
  productive: 'produtivo',
  high: 'alto',
  above_mrv: 'acima do máximo',
};

export const SKIP_REASONS = [
  'Aparelho ocupado',
  'Dor ou desconforto',
  'Sem tempo',
  'Outro',
] as const;

export const RIR_OPTIONS = [
  { value: 0, label: '0' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4+' },
] as const;
