import { addDays, daysBetween } from '@atlas/core';

export type Preset = '4w' | '12w' | '6m' | '1y' | 'custom';

export const PRESETS: { value: Preset; label: string; days: number }[] = [
  { value: '4w', label: '4 semanas', days: 28 },
  { value: '12w', label: '12 semanas', days: 84 },
  { value: '6m', label: '6 meses', days: 182 },
  { value: '1y', label: '1 ano', days: 365 },
  { value: 'custom', label: 'Personalizado', days: 0 },
];

export interface Range {
  from: string;
  to: string;
}

/** Período escolhido e o anterior, de mesmo tamanho, para a comparação. */
export function periods(
  preset: Preset,
  today: string,
  custom: Range,
): { current: Range; previous: Range } {
  const p = PRESETS.find((x) => x.value === preset);
  const current =
    preset === 'custom' || !p ? custom : { from: addDays(today, -(p.days - 1)), to: today };
  // Datas incompletas no modo personalizado: sem período anterior (a tela mostra o erro).
  if (!current.from || !current.to || current.from > current.to)
    return { current, previous: current };
  const length = daysBetween(current.from, current.to) + 1;
  return {
    current,
    previous: { from: addDays(current.from, -length), to: addDays(current.from, -1) },
  };
}
