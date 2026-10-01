export interface TextNumber {
  /** Trecho como apareceu no texto. */
  raw: string;
  value: number;
  /** Casas decimais exibidas (tolerância de arredondamento). */
  decimals: number;
  /** Unidade logo depois do número, se houver (`%`, `kg`, `g`, `kcal`...). */
  unit: string | null;
}

// Data dd/mm ou dd/mm/aaaa (antes dos números para não quebrar em dois).
const DATE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;
// Número pt-BR: sinal opcional; milhar com ponto (grupos de 3) ou dígitos; decimal com vírgula.
// Ponto seguido de 1–2 dígitos é lido como decimal (texto em inglês).
// Aceita unidade colada ("80kg", "3,5kg") mas não números dentro de palavras ("B2").
const NUMBER =
  /(?<![\w.,])([−-]?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+)|\.(\d{1,2})(?!\d))?(?![\d.,]\d)(?!\d)\s?(%|kcal|kg|g|ml|h|min|ua)?(?![a-zà-ú])/gi;

/** Datas dd/mm(/aaaa) do texto, como `MM-DD` para comparar com datas ISO. */
export function extractDates(text: string): { raw: string; monthDay: string }[] {
  return [...text.matchAll(DATE)].flatMap((m) => {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return [];
    return [
      { raw: m[0], monthDay: `${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` },
    ];
  });
}

/** Números de um texto em pt-BR (datas dd/mm ficam de fora; veja `extractDates`). */
export function extractNumbers(text: string): TextNumber[] {
  const withoutDates = text.replace(DATE, (s) => ' '.repeat(s.length));
  return [...withoutDates.matchAll(NUMBER)].map((m) => {
    const sign = m[1] ? -1 : 1;
    const int = (m[2] ?? '0').replace(/\./g, '');
    const frac = m[3] ?? m[4] ?? '';
    const value = sign * Number(frac ? `${int}.${frac}` : int);
    const unit = m[5]?.toLowerCase() ?? null;
    const raw = unit ? m[0].slice(0, m[0].length - (m[5]?.length ?? 0)).trimEnd() : m[0];
    return { raw, value, decimals: frac.length, unit };
  });
}

/** Todos os números (e datas ISO como `MM-DD`) presentes em valores JSON e textos. */
export function collectSourceValues(sources: readonly unknown[]): {
  numbers: number[];
  monthDays: Set<string>;
} {
  const numbers: number[] = [];
  const monthDays = new Set<string>();
  const visit = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) numbers.push(v);
    else if (typeof v === 'string') {
      for (const iso of v.matchAll(/\b\d{4}-(\d{2})-(\d{2})/g))
        monthDays.add(`${iso[1]}-${iso[2]}`);
      for (const d of extractDates(v)) monthDays.add(d.monthDay);
      for (const n of extractNumbers(v.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')))
        numbers.push(n.value);
    } else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  };
  sources.forEach(visit);
  return { numbers, monthDays };
}

/** Arredonda como o `Intl.NumberFormat` exibe: metade para longe do zero (−0,35 → −0,4). */
const roundTo = (v: number, d: number) =>
  (Math.sign(v) * Math.round(Math.abs(v) * 10 ** d + 1e-9)) / 10 ** d;

/**
 * O número exibido bate com algum número da fonte, com o arredondamento da exibição. Conversões
 * só quando a unidade escrita pede: `%` aceita fração × 100; `kg`/`g` aceitam a troca g ↔ kg.
 * O sinal pode vir no texto ("caiu 4,3 kg").
 */
function matches(n: TextNumber, source: number): boolean {
  const target = Math.abs(n.value);
  const candidates = [source];
  if (n.unit === '%') candidates.push(source * 100);
  if (n.unit === 'kg') candidates.push(source / 1000);
  if (n.unit === 'g') candidates.push(source * 1000);
  return candidates.some((c) => Math.abs(Math.abs(roundTo(c, n.decimals)) - target) < 1e-9);
}

export interface GroundingResult {
  ok: boolean;
  /** Trechos com número ou data que não aparecem nas fontes. */
  ungrounded: string[];
  checked: number;
}

/**
 * Confere se cada número citado num texto do Coach existe nas fontes (ADR-055): retornos das
 * ferramentas e contexto injetado. Ignora contagens de 0 a 10 e números presentes em `ignoreText`
 * (a pergunta do usuário).
 */
export function groundedNumbers(
  text: string,
  sources: readonly unknown[],
  opts: { ignoreText?: string } = {},
): GroundingResult {
  const { numbers, monthDays } = collectSourceValues(sources);
  const ignored = new Set(extractNumbers(opts.ignoreText ?? '').map((n) => Math.abs(n.value)));
  const ungrounded: string[] = [];
  let checked = 0;
  for (const n of extractNumbers(text)) {
    const abs = Math.abs(n.value);
    if ((n.decimals === 0 && abs <= 10) || ignored.has(abs)) continue;
    checked += 1;
    if (!numbers.some((s) => matches(n, s))) ungrounded.push(n.raw.trim());
  }
  for (const d of extractDates(text)) {
    checked += 1;
    if (!monthDays.has(d.monthDay)) ungrounded.push(d.raw);
  }
  return { ok: ungrounded.length === 0, ungrounded, checked };
}
