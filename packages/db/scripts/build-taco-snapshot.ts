/**
 * Gera `seeds/foods/taco.json` a partir da conversão pública da TACO 4ª ed. (ADR-023).
 * Uso: pnpm tsx scripts/build-taco-snapshot.ts <caminho/TACO.json>
 * "Tr" (traço) → 0; "NA", "*" e vazio → null; itens sem kcal são descartados.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Raw = Record<string, unknown> & { id: number; description: string; category: string };

const input = process.argv[2];
if (!input) {
  console.error('informe o caminho do TACO.json');
  process.exit(1);
}

/** Arredonda como a tabela impressa da TACO: kcal e mg inteiros, gramas e ferro com 1 casa (ADR-029). */
function num(v: unknown, decimals: number): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const f = 10 ** decimals;
    return Math.round(v * f) / f;
  }
  if (v === 'Tr') return 0;
  return null;
}

const raw = JSON.parse(readFileSync(input, 'utf8')) as Raw[];
const out = raw
  .map((r) => ({
    ref: String(r.id),
    name: r.description.trim(),
    group: r.category,
    kcal: num(r.energy_kcal, 0),
    proteinG: num(r.protein_g, 1),
    carbsG: num(r.carbohydrate_g, 1),
    fatG: num(r.lipid_g, 1),
    fiberG: num(r.fiber_g, 1),
    saturatedFatG: num(r.saturated_g, 1),
    sodiumMg: num(r.sodium_mg, 0),
    potassiumMg: num(r.potassium_mg, 0),
    calciumMg: num(r.calcium_mg, 0),
    ironMg: num(r.iron_mg, 1),
    cholesterolMg: num(r.cholesterol_mg, 0),
  }))
  .filter((f) => f.kcal !== null);

writeFileSync(
  resolve(import.meta.dirname, '../seeds/foods/taco.json'),
  `${JSON.stringify(out, null, 0)}\n`,
);
console.log(`TACO: ${String(out.length)} de ${String(raw.length)} itens (sem kcal descartados).`);
