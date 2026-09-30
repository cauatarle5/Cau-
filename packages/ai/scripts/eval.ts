/**
 * `pnpm ai:eval`: acurácia do parser (P13) sobre as frases gabaritadas.
 * Usa a IA se ANTHROPIC_API_KEY e AI_MODEL_FAST estiverem definidos; senão, as regras.
 * Metas: item ≥ 90%, quantidade ≥ 95%.
 */
import { normalizeForSearch } from '@atlas/core';

import { PARSER_EVAL_CASES } from '../src/evals/parser-cases';
import { createFoodParser } from '../src/parser';

const parser = createFoodParser({
  model: process.env.AI_MODEL_FAST,
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeoutMs: 15_000,
});

let expectedItems = 0;
let itemHits = 0;
let quantityHits = 0;
const sources = new Set<string>();

for (const c of PARSER_EVAL_CASES) {
  const result = await parser.parse(c.text);
  sources.add(result.source);
  for (const [query, quantity, unit] of c.items) {
    expectedItems += 1;
    const found = result.items.find((i) => normalizeForSearch(i.foodQuery) === query);
    if (found) {
      itemHits += 1;
      if (found.quantity === quantity && found.unit === unit) quantityHits += 1;
    } else {
      console.log(`✗ "${c.text}": faltou "${query}"`);
    }
  }
}

const itemAcc = itemHits / expectedItems;
const qtyAcc = quantityHits / expectedItems;
console.log(`Fonte: ${[...sources].join(', ')} · frases: ${String(PARSER_EVAL_CASES.length)}`);
console.log(`Acurácia de item: ${(itemAcc * 100).toFixed(1)}% (meta 90%)`);
console.log(`Acurácia de quantidade/unidade: ${(qtyAcc * 100).toFixed(1)}% (meta 95%)`);
if (itemAcc < 0.9 || qtyAcc < 0.95) process.exitCode = 1;
