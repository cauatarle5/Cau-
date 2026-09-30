export type FoodCategory =
  | 'cereals'
  | 'legumes'
  | 'meats'
  | 'poultry'
  | 'fish'
  | 'eggs'
  | 'dairy'
  | 'fruits'
  | 'vegetables'
  | 'tubers'
  | 'fats_oils'
  | 'sweets'
  | 'beverages'
  | 'supplements'
  | 'prepared'
  | 'other';

export type FoodState = 'raw' | 'cooked' | 'grilled' | 'fried' | 'boiled' | 'roasted' | 'ready';

export interface MatchCandidate {
  /** Similaridade trigram 0..1 (nome ou alias). */
  similarity: number;
  timesUsed: number;
  verified: boolean;
  category: FoodCategory;
  state: FoodState;
}

/** Categorias que assumem "cozido" salvo menção a "cru" (P6.2 passo 4). */
const COOKED_BY_DEFAULT: readonly FoodCategory[] = [
  'cereals',
  'legumes',
  'meats',
  'poultry',
  'fish',
  'tubers',
  'eggs',
];
/** Penalidade na similaridade de itens crus quando o texto não pede cru (ADR-028). */
export const RAW_PENALTY = 0.8;

export function mentionsRaw(query: string): boolean {
  return /\b(cru|crua|crus|cruas)\b/.test(query);
}

/** Uso do usuário normalizado 0..1 (10 usos ou mais = 1). */
export function usageScore(timesUsed: number): number {
  return Math.min(1, Math.max(0, timesUsed) / 10);
}

/** pontuação = similaridade × 0,6 + uso × 0,3 + verificado/oficial × 0,1 (P6.2 passo 4). */
export function matchScore(query: string, c: MatchCandidate): number {
  let similarity = c.similarity;
  if (c.state === 'raw' && COOKED_BY_DEFAULT.includes(c.category) && !mentionsRaw(query)) {
    similarity *= RAW_PENALTY;
  }
  return similarity * 0.6 + usageScore(c.timesUsed) * 0.3 + (c.verified ? 0.1 : 0);
}

export type MatchConfidence = 'auto' | 'review' | 'choose';

/** ≥ 0,75 automático; 0,45–0,75 melhor + alternativas; < 0,45 pede escolha. */
export function confidenceBand(score: number): MatchConfidence {
  if (score >= 0.75) return 'auto';
  if (score >= 0.45) return 'review';
  return 'choose';
}
