import { and, eq, isNull } from 'drizzle-orm';

import { normalizeForSearch, type FoodCategory, type FoodState } from '@atlas/core';

import { ALIASES } from '../seeds/foods/aliases';
import { FOOD_MEASURES, GENERIC_MEASURES } from '../seeds/foods/measures';
import taco from '../seeds/foods/taco.json' with { type: 'json' };

import type { Database } from './client';
import { foodAliases, foodNutrients, foods, foodSources, householdMeasures } from './schema';

export interface TacoItem {
  ref: string;
  name: string;
  group: string;
  kcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  saturatedFatG: number | null;
  sodiumMg: number | null;
  potassiumMg: number | null;
  calciumMg: number | null;
  ironMg: number | null;
  cholesterolMg: number | null;
}

export const TACO_ITEMS = taco as TacoItem[];

const TUBERS = /^(batata|mandioca|inhame|cara|mandioquinha)/;
const POULTRY = /^(frango|peru|galinha)/;

/** Categoria a partir do grupo e da descrição TACO (ADR-023). */
export function tacoCategory(group: string, name: string): FoodCategory {
  const n = normalizeForSearch(name);
  switch (group) {
    case 'Cereais e derivados':
      return 'cereals';
    case 'Verduras, hortaliças e derivados':
      return TUBERS.test(n) ? 'tubers' : 'vegetables';
    case 'Frutas e derivados':
      return 'fruits';
    case 'Gorduras e óleos':
      return 'fats_oils';
    case 'Pescados e frutos do mar':
      return 'fish';
    case 'Carnes e derivados':
      return POULTRY.test(n) ? 'poultry' : 'meats';
    case 'Leite e derivados':
      return 'dairy';
    case 'Bebidas (alcoólicas e não alcoólicas)':
      return 'beverages';
    case 'Ovos e derivados':
      return 'eggs';
    case 'Produtos açucarados':
      return 'sweets';
    case 'Alimentos preparados':
    case 'Outros alimentos industrializados':
      return 'prepared';
    case 'Leguminosas e derivados':
      return 'legumes';
    default:
      return 'other';
  }
}

/** Estado a partir da descrição TACO. */
export function tacoState(name: string): FoodState {
  const n = normalizeForSearch(name);
  if (/\bgrelhad[oa]s?\b/.test(n)) return 'grilled';
  if (/\bfrit[oa]s?\b/.test(n)) return 'fried';
  if (/\bassad[oa]s?\b/.test(n)) return 'roasted';
  if (/\bcozid[oa]s?\b/.test(n)) return 'cooked';
  if (/\bcru[as]?\b/.test(n)) return 'raw';
  return 'ready';
}

const LIQUID =
  /^(refrigerante|cerveja|cafe, infusao|leite, de vaca, achocolatado|leite, fermentado|coco, agua|soja, extrato soluvel, natural)|, suco\b/;

/** Seed idempotente: fontes, TACO, aliases e medidas de sistema (ADR-023/024). */
export async function seedFoods(db: Database): Promise<void> {
  await db
    .insert(foodSources)
    .values([
      {
        code: 'taco',
        name: 'TACO 4ª edição (NEPA/UNICAMP)',
        licenseNote:
          'Tabela Brasileira de Composição de Alimentos, 4ª ed. revisada e ampliada, NEPA/UNICAMP, 2011. Reprodução permitida citando a fonte.',
      },
      { code: 'user', name: 'Cadastro do usuário', licenseNote: 'Informado pelo usuário.' },
      {
        code: 'recipe',
        name: 'Receita do usuário',
        licenseNote: 'Calculada dos ingredientes (ADR-038).',
      },
    ])
    .onConflictDoNothing();

  const existing = await db
    .select({ id: foods.id, ref: foods.sourceRef })
    .from(foods)
    .where(and(eq(foods.sourceCode, 'taco'), isNull(foods.userId)));
  const idByRef = new Map(existing.map((e) => [e.ref ?? '', e.id]));

  for (const item of TACO_ITEMS) {
    let id = idByRef.get(item.ref);
    const n = normalizeForSearch(item.name);
    const values = {
      namePt: item.name,
      nameNormalized: n,
      category: tacoCategory(item.group, item.name),
      state: tacoState(item.name),
      defaultUnit: LIQUID.test(n) ? ('ml' as const) : ('g' as const),
      isVerified: true,
    };
    if (id) {
      await db.update(foods).set(values).where(eq(foods.id, id));
    } else {
      const [row] = await db
        .insert(foods)
        .values({ ...values, sourceCode: 'taco', sourceRef: item.ref })
        .returning({ id: foods.id });
      if (!row) throw new Error('insert foods returned no row');
      id = row.id;
      idByRef.set(item.ref, id);
    }
    const nutrients = {
      kcal: item.kcal,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      fiberG: item.fiberG,
      sugarG: null,
      saturatedFatG: item.saturatedFatG,
      sodiumMg: item.sodiumMg,
      potassiumMg: item.potassiumMg,
      calciumMg: item.calciumMg,
      ironMg: item.ironMg,
      cholesterolMg: item.cholesterolMg,
    };
    await db
      .insert(foodNutrients)
      .values({ foodId: id, ...nutrients })
      .onConflictDoUpdate({ target: foodNutrients.foodId, set: nutrients });
  }

  const idByName = new Map(TACO_ITEMS.map((t) => [t.name, idByRef.get(t.ref)]));
  const resolve = (name: string) => {
    const id = idByName.get(name);
    if (!id) throw new Error(`seed: alimento TACO não encontrado: "${name}"`);
    return id;
  };

  await db.transaction(async (tx) => {
    // Aliases e medidas de sistema são recriados (sem referências externas a eles).
    await tx.delete(foodAliases).where(isNull(foodAliases.userId));
    const aliasRows = [
      ...new Map(
        ALIASES.map(([alias, name]) => [normalizeForSearch(alias), resolve(name)]),
      ).entries(),
    ].map(([aliasNormalized, foodId]) => ({ aliasNormalized, foodId }));
    await tx.insert(foodAliases).values(aliasRows);

    await tx.delete(householdMeasures).where(isNull(householdMeasures.userId));
    await tx.insert(householdMeasures).values([
      ...GENERIC_MEASURES.map((m) => ({ ...m, foodId: null, isDefault: false })),
      ...FOOD_MEASURES.map(({ tacoName, isDefault, ...m }) => ({
        ...m,
        foodId: resolve(tacoName),
        isDefault: isDefault ?? false,
      })),
    ]);
  });
}
