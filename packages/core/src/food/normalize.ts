/** Minúsculas, sem acento, espaços colapsados: forma usada na busca (P6.2, passo 1). */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.,;%/+\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NUMBER_WORDS: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  quinze: 15,
  vinte: 20,
  trinta: 30,
  cem: 100,
  duzentos: 200,
  duzentas: 200,
  trezentos: 300,
  trezentas: 300,
  meio: 0.5,
  meia: 0.5,
};

/**
 * Normaliza texto livre de refeição: sem acento, minúsculas, vírgula decimal → ponto,
 * números por extenso → dígitos ("duas" → 2, "meia" → 0,5, "uma e meia" → 1,5).
 */
export function normalizeMealText(text: string): string {
  // Quebras de linha separam itens: viram vírgulas antes da normalização.
  let s = normalizeForSearch(text.replace(/\r?\n+/g, ', '));
  // Vírgula decimal (1,5) → 1.5; vírgula seguida de espaço continua separando itens.
  s = s.replace(/(\d),(\d)/g, '$1.$2');
  // "1/2" → 0.5
  s = s.replace(/\b(\d+)\/(\d+)\b/g, (_, a: string, b: string) => String(Number(a) / Number(b)));
  // "uma e meia" / "2 e meio" → 1.5 / 2.5
  s = s.replace(/\b(\d+(?:\.\d+)?|um|uma|dois|duas|tres)\s+e\s+mei[oa]\b/g, (_, n: string) =>
    String((NUMBER_WORDS[n] ?? Number(n)) + 0.5),
  );
  // "meia duzia" → 6
  s = s.replace(/\bmeia duzia\b/g, '6').replace(/\buma duzia\b/g, '12');
  // Número por extenso só no início de um item ("queijo meia cura" continua igual).
  s = s.replace(/(^|[,;+]\s*|\se\s+)([a-z]+)\b/g, (whole: string, lead: string, word: string) => {
    const n = NUMBER_WORDS[word];
    return n === undefined ? whole : `${lead}${String(n)}`;
  });
  return s.replace(/\s+/g, ' ').trim();
}
