/** Nutrientes por 100 g/ml (DATA_MODEL 4.5). Ausente = `null`, nunca zero implícito. */
export const NUTRIENT_KEYS = [
  'kcal',
  'proteinG',
  'carbsG',
  'fatG',
  'fiberG',
  'sugarG',
  'saturatedFatG',
  'sodiumMg',
  'potassiumMg',
  'calciumMg',
  'ironMg',
  'cholesterolMg',
] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
export type Nutrients = Record<NutrientKey, number | null>;

/** nutriente = valor_por_100 × gramas / 100, para cada nutriente não nulo (P6.2 passo 6). */
export function scaleNutrients(per100: Nutrients, grams: number): Nutrients {
  const out = {} as Nutrients;
  for (const k of NUTRIENT_KEYS) {
    const v = per100[k];
    out[k] = v === null ? null : (v * grams) / 100;
  }
  return out;
}

/** Soma de snapshots; um nutriente só é `null` se ausente em todos os itens. */
export function sumNutrients(items: readonly Nutrients[]): Nutrients {
  const out = {} as Nutrients;
  for (const k of NUTRIENT_KEYS) {
    const present = items.map((i) => i[k]).filter((v): v is number => v !== null);
    out[k] = present.length === 0 ? null : present.reduce((a, b) => a + b, 0);
  }
  return out;
}

export const emptyNutrients = (): Nutrients =>
  Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, null])) as Nutrients;
