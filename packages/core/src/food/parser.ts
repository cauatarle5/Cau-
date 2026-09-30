import { normalizeMealText } from './normalize';
import type { FoodUnit } from './units';

export interface ParsedItem {
  raw: string;
  foodQuery: string;
  quantity: number;
  unit: FoodUnit | null;
  preparation: string | null;
}

/** Palavras → unidade canônica. Ordem importa (compostos antes dos simples). */
const UNIT_PATTERNS: readonly [RegExp, FoodUnit][] = [
  [/^(?:colher(?:es)?|colheres) de sopa(?: cheias?| rasas?)?\b/, 'tbsp'],
  [
    /^(?:colher(?:es)?|colherinhas?|colherzinhas?) de (?:cha|sobremesa|cafe)(?: cheias?| rasas?)?\b/,
    'tsp',
  ],
  [/^(?:colherinhas?|colherzinhas?)\b/, 'tsp'],
  [/^(?:colher(?:es)?|cs)(?: cheias?| rasas?)?\b/, 'tbsp'],
  [/^(?:xicaras?|xic|xicara de cha)\b/, 'cup'],
  [/^(?:conchas?)(?: pequenas?| medias?| grandes?| cheias?)?\b/, 'ladle'],
  [/^(?:fatias?)(?: finas?| grossas?| medias?)?\b/, 'slice'],
  [/^(?:scoops?|dosador(?:es)?|medidas?)\b/, 'scoop'],
  [/^(?:porc(?:ao|oes))\b/, 'portion'],
  [/^(?:pitadas?)\b/, 'pinch'],
  [/^(?:copos?)(?: americanos?| grandes?| pequenos?)?\b/, 'glass'],
  [/^(?:latas?|latinhas?)\b/, 'can'],
  [/^(?:unidades?|und|un|unid)\b/, 'unit'],
  [/^(?:kg|quilos?|kilos?)\b/, 'kg'],
  [/^(?:g|gr|grs|gramas?)\b/, 'g'],
  [/^(?:ml|mililitros?)\b/, 'ml'],
  [/^(?:l|litros?)\b/, 'l'],
];

const SIZE_WORDS: Record<string, FoodUnit> = {
  pequeno: 'small',
  pequena: 'small',
  medio: 'medium',
  media: 'medium',
  grande: 'large',
};

const PREPARATIONS = [
  'cru',
  'crua',
  'cozido',
  'cozida',
  'grelhado',
  'grelhada',
  'frito',
  'frita',
  'assado',
  'assada',
  'refogado',
  'refogada',
  'mexido',
  'mexidos',
  'cozidos',
  'fritos',
] as const;

const CONNECTORS = /^(?:de|do|da|dos|das)\s+/;
const NUMBER = String.raw`(\d+(?:\.\d+)?)`;

function takeUnit(text: string): { unit: FoodUnit | null; rest: string } {
  for (const [re, unit] of UNIT_PATTERNS) {
    const m = re.exec(text);
    if (m) return { unit, rest: text.slice(m[0].length).trim() };
  }
  return { unit: null, rest: text };
}

function extractPreparation(query: string): string | null {
  const words = query.split(' ');
  const found = words.find((w) => (PREPARATIONS as readonly string[]).includes(w));
  return found ?? null;
}

/** Tamanho no fim do nome ("banana media") vira a unidade, se nenhuma foi dita. */
function sizeFromQuery(query: string): { unit: FoodUnit | null; query: string } {
  const words = query.split(' ');
  const last = words.at(-1);
  const size = last ? SIZE_WORDS[last] : undefined;
  if (size && words.length > 1) return { unit: size, query: words.slice(0, -1).join(' ') };
  return { unit: null, query };
}

function parseSegment(segment: string): ParsedItem | null {
  const raw = segment.trim();
  if (!raw) return null;
  let quantity: number | null = null;
  let unit: FoodUnit | null = null;
  let rest = raw;

  // "200g de arroz", "2 ovos", "1 concha de feijao"
  const lead = new RegExp(String.raw`^${NUMBER}\s*(.*)$`).exec(rest);
  if (lead) {
    quantity = Number(lead[1]);
    ({ unit, rest } = takeUnit((lead[2] ?? '').trim()));
  } else {
    // "whey 1 scoop", "arroz 200g"
    const trail = new RegExp(String.raw`^(.+?)\s+${NUMBER}\s*(.*)$`).exec(rest);
    if (trail) {
      const taken = takeUnit((trail[3] ?? '').trim());
      if (taken.rest === '') {
        quantity = Number(trail[2]);
        unit = taken.unit;
        rest = trail[1] ?? '';
      }
    }
  }

  rest = rest.replace(CONNECTORS, '').trim();
  if (!rest) return null;
  let foodQuery = rest;
  if (unit === null) {
    const sized = sizeFromQuery(foodQuery);
    unit = sized.unit;
    foodQuery = sized.query;
  }
  return {
    raw,
    foodQuery,
    quantity: quantity ?? 1,
    unit,
    preparation: extractPreparation(foodQuery),
  };
}

/**
 * Parser por regras (fallback sem IA, P6.2 passo 3): separa por vírgula, ";", "+",
 * quebra de linha e " e ", e lê `<número><unidade>? (de)? <alimento>`.
 */
export function parseMealText(text: string): ParsedItem[] {
  const normalized = normalizeMealText(text);
  return normalized
    .split(/\s*(?:,|;|\+)\s*|\s+e\s+/)
    .map(parseSegment)
    .filter((i): i is ParsedItem => i !== null);
}
