const nf = (digits: number) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** Formata número para exibição em pt-BR (só formatação; o cálculo vem do core). */
export function formatNumber(value: number, digits = 0): string {
  return nf(digits).format(value);
}

export function formatDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d ?? ''}/${m ?? ''}/${y ?? ''}`;
}

export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

/** Aceita vírgula ou ponto como decimal; `null` enquanto o texto não for um número completo. */
export function parseDecimal(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** Número para campo editável: sem separador de milhar, para `parseDecimal` ler de volta. */
export function formatInputNumber(value: number, digits = 2): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: digits, useGrouping: false });
}
