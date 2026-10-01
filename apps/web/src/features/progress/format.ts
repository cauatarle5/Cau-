import { formatNumber } from '@/lib/format';

/** Número com sinal (+/−) em pt-BR; `—` quando ausente. */
export function signed(value: number | null, digits = 0, unit = ''): string {
  if (value === null) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatNumber(Math.abs(value), digits)}${unit}`;
}

export function maybe(value: number | null, digits = 0, unit = ''): string {
  return value === null ? '—' : `${formatNumber(value, digits)}${unit}`;
}
