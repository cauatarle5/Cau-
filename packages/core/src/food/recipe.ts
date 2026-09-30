import { emptyNutrients, NUTRIENT_KEYS, sumNutrients, type Nutrients } from './nutrients';

export interface RecipeIngredient {
  grams: number;
  /** Nutrientes do ingrediente na quantidade usada (snapshot do item). */
  nutrients: Nutrients;
}

export interface RecipeNutrition {
  total: Nutrients;
  perServing: Nutrients;
  /** Por 100 g da receita pronta (peso cozido) ou, sem ele, do peso somado dos ingredientes. */
  per100: Nutrients;
  totalGrams: number;
  /** Peso de uma porção. */
  servingGrams: number;
  /** `per100` usa o peso cozido informado. */
  cookedBasis: boolean;
}

const divide = (n: Nutrients, by: number): Nutrients => {
  const out = {} as Nutrients;
  for (const k of NUTRIENT_KEYS) {
    const v = n[k];
    out[k] = v === null ? null : v / by;
  }
  return out;
};

/**
 * Nutrição de receita (P7.1): total = soma dos ingredientes; porção = total / porções;
 * por 100 g = total × 100 / peso cozido (ou peso cru somado). ADR-038.
 */
export function recipeNutrition(
  ingredients: readonly RecipeIngredient[],
  servings: number,
  cookedWeightG?: number | null,
): RecipeNutrition {
  const total = sumNutrients(ingredients.map((i) => i.nutrients));
  const rawGrams = ingredients.reduce((a, i) => a + i.grams, 0);
  const cooked = cookedWeightG ?? 0;
  const cookedBasis = cooked > 0;
  const totalGrams = cookedBasis ? cooked : rawGrams;
  const safeServings = servings > 0 ? servings : 1;
  return {
    total,
    perServing: divide(total, safeServings),
    per100: totalGrams > 0 ? divide(total, totalGrams / 100) : emptyNutrients(),
    totalGrams,
    servingGrams: totalGrams / safeServings,
    cookedBasis,
  };
}
