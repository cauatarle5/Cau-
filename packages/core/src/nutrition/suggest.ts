import solver from 'javascript-lp-solver';

export interface Macros {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface SuggestPoolItem {
  key: string;
  name: string;
  /** Macros por 100 g (ausente = 0). */
  per100: Macros;
  /** Múltiplo prático em gramas (10 g, ou meia porção/unidade). */
  step: number;
  /** Limite prático por item, em gramas. */
  maxGrams: number;
}

export interface SuggestConstraints {
  kcal: number;
  proteinMin: number;
  carbsMax: number;
  fatMax: number;
}

export interface SuggestOption {
  items: { key: string; name: string; grams: number }[];
  totals: Macros;
  /** Quanto sobra dos limites da refeição após a sugestão. */
  remaining: Macros;
}

const KEYS = ['kcal', 'proteinG', 'carbsG', 'fatG'] as const;
const EPS = 1e-6;

function totalsOf(items: readonly { item: SuggestPoolItem; grams: number }[]): Macros {
  const t: Macros = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const { item, grams } of items) {
    for (const k of KEYS) t[k] += (item.per100[k] * grams) / 100;
  }
  return t;
}

function fits(t: Macros, c: SuggestConstraints) {
  return (
    t.kcal <= c.kcal + EPS &&
    t.proteinG >= c.proteinMin - EPS &&
    t.carbsG <= c.carbsMax + EPS &&
    t.fatG <= c.fatMax + EPS
  );
}

/** LP: maximiza kcal (≈ menor desvio, já que kcal ≤ disponível) com proteína mínima dura. */
function solveCombo(combo: readonly SuggestPoolItem[], c: SuggestConstraints) {
  const bounds: Record<string, { min?: number; max?: number }> = {
    kcal: { max: c.kcal },
    carbsG: { max: c.carbsMax },
    fatG: { max: c.fatMax },
    ...(c.proteinMin > 0 ? { proteinG: { min: c.proteinMin } } : {}),
  };
  const variables: Record<string, Record<string, number>> = {};
  combo.forEach((item, i) => {
    bounds[`max${String(i)}`] = { max: item.maxGrams };
    bounds[`min${String(i)}`] = { min: item.step };
    const coefs: Record<string, number> = {
      // Objetivo com nome próprio: a biblioteca ignora restrição de mesmo nome (ADR-039).
      obj: item.per100.kcal / 100,
      kcal: item.per100.kcal / 100,
      proteinG: item.per100.proteinG / 100,
      carbsG: item.per100.carbsG / 100,
      fatG: item.per100.fatG / 100,
      [`max${String(i)}`]: 1,
      [`min${String(i)}`]: 1,
    };
    // A biblioteca trata coeficiente 0 como inviável: só termos não nulos.
    variables[`x${String(i)}`] = Object.fromEntries(
      Object.entries(coefs).filter(([, v]) => v !== 0),
    );
  });
  // Restrição sem termos: trivial se for teto; inviável se exigir mínimo positivo.
  const used = (name: string) => Object.values(variables).some((v) => name in v);
  const entries = Object.entries(bounds);
  if (entries.some(([name, b]) => !used(name) && (b.min ?? 0) > 0)) return null;
  const constraints = Object.fromEntries(entries.filter(([name]) => used(name)));
  const r = solver.Solve({ optimize: 'obj', opType: 'max', constraints, variables }) as Record<
    string,
    unknown
  > & { feasible: boolean };
  if (!r.feasible) return null;
  return combo.map((_, i) => {
    const v = r[`x${String(i)}`];
    return typeof v === 'number' ? v : 0;
  });
}

/** Arredonda para baixo em múltiplos práticos; se faltar proteína, sobe o item mais proteico. */
function roundCombo(
  combo: readonly SuggestPoolItem[],
  grams: readonly number[],
  c: SuggestConstraints,
) {
  const rounded = combo.map((item, i) => ({
    item,
    grams: Math.floor((grams[i] ?? 0) / item.step + EPS) * item.step,
  }));
  if (rounded.some((r) => r.grams <= 0)) return null;
  if (fits(totalsOf(rounded), c)) return rounded;
  const byProtein = [...rounded].sort(
    (a, b) =>
      b.item.per100.proteinG / b.item.per100.kcal - a.item.per100.proteinG / a.item.per100.kcal,
  );
  const top = byProtein[0];
  if (!top) return null;
  top.grams += top.item.step;
  return fits(totalsOf(rounded), c) && top.grams <= top.item.maxGrams ? rounded : null;
}

function* combinations<T>(list: readonly T[], size: number, start = 0): Generator<T[]> {
  if (size === 0) {
    yield [];
    return;
  }
  for (let i = start; i <= list.length - size; i++) {
    for (const rest of combinations(list, size - 1, i + 1)) yield [list[i] as T, ...rest];
  }
}

/**
 * Sugestão de refeição pelos macros restantes (P7.2, ADR-039): combinações de 1 a 3 itens do
 * pool, quantidades por LP, porções práticas; as melhores pelo menor kcal restante e, no
 * empate, menos itens.
 */
export function suggestMeal(
  pool: readonly SuggestPoolItem[],
  constraints: SuggestConstraints,
  opts: { maxItems?: number; limit?: number } = {},
): SuggestOption[] {
  const c: SuggestConstraints = {
    kcal: Math.max(0, constraints.kcal),
    proteinMin: Math.max(0, constraints.proteinMin),
    carbsMax: Math.max(0, constraints.carbsMax),
    fatMax: Math.max(0, constraints.fatMax),
  };
  if (c.kcal <= 0) return [];
  const usable = pool.filter((p) => p.per100.kcal > 0 && p.step > 0 && p.maxGrams >= p.step);
  const found = new Map<string, SuggestOption>();
  for (let size = 1; size <= (opts.maxItems ?? 3); size++) {
    for (const combo of combinations(usable, size)) {
      const grams = solveCombo(combo, c);
      if (!grams) continue;
      const rounded = roundCombo(combo, grams, c);
      if (!rounded) continue;
      const totals = totalsOf(rounded);
      const signature = rounded.map((r) => `${r.item.key}:${String(r.grams)}`).join('|');
      found.set(signature, {
        items: rounded.map((r) => ({ key: r.item.key, name: r.item.name, grams: r.grams })),
        totals,
        remaining: {
          kcal: c.kcal - totals.kcal,
          proteinG: totals.proteinG - c.proteinMin,
          carbsG: c.carbsMax - totals.carbsG,
          fatG: c.fatMax - totals.fatG,
        },
      });
    }
  }
  return [...found.values()]
    .sort(
      (a, b) =>
        a.remaining.kcal - b.remaining.kcal ||
        a.items.length - b.items.length ||
        a.items
          .map((i) => i.key)
          .join()
          .localeCompare(b.items.map((i) => i.key).join()),
    )
    .slice(0, opts.limit ?? 3);
}
