import type { z } from 'zod';

import {
  confidenceBand,
  emptyNutrients,
  matchScore,
  normalizeForSearch,
  scaleNutrients,
  sumNutrients,
  toGrams,
  type FoodUnit,
  type MeasureOption,
  type Nutrients,
  type ParsedItem,
} from '@atlas/core';
import type { FoodDto, ParsedItemDto, customFoodInputSchema } from '@atlas/schemas';

import { AppError } from '../../lib/errors';

import type { FoodBundle, FoodsRepository } from './repository';

export const foodNotFound = () => new AppError(404, 'FOOD_NOT_FOUND', 'Alimento não encontrado');

export function per100(bundle: FoodBundle): Nutrients {
  const n = bundle.nutrients;
  if (!n) return emptyNutrients();
  return {
    kcal: n.kcal,
    proteinG: n.proteinG,
    carbsG: n.carbsG,
    fatG: n.fatG,
    fiberG: n.fiberG,
    sugarG: n.sugarG,
    saturatedFatG: n.saturatedFatG,
    sodiumMg: n.sodiumMg,
    potassiumMg: n.potassiumMg,
    calciumMg: n.calciumMg,
    ironMg: n.ironMg,
    cholesterolMg: n.cholesterolMg,
  };
}

export function measureOptions(bundle: FoodBundle): MeasureOption[] {
  return bundle.measures.map((m) => ({
    unitCode: m.unitCode,
    grams: m.grams,
    isDefault: m.isDefault,
    scope: m.foodId === null ? 'generic' : m.userId === null ? 'food' : 'user',
  }));
}

export function toFoodDto(bundle: FoodBundle): FoodDto {
  const { food } = bundle;
  return {
    id: food.id,
    namePt: food.namePt,
    brand: food.brand,
    category: food.category,
    state: food.state,
    sourceCode: food.sourceCode,
    isCustom: food.userId !== null,
    isVerified: food.isVerified,
    defaultUnit: food.defaultUnit,
    per100: per100(bundle),
    measures: bundle.measures.map((m) => ({
      unitCode: m.unitCode,
      labelPt: m.labelPt,
      grams: m.grams,
      isDefault: m.isDefault,
      scope: m.foodId === null ? 'generic' : m.userId === null ? 'food' : 'user',
    })),
  };
}

/** Converte a quantidade e calcula o snapshot de nutrientes (P6.2 passos 5–6). */
export function computePortion(
  bundle: FoodBundle,
  quantity: number,
  unit: FoodUnit | null,
  gramsOverride?: number | null,
) {
  if (gramsOverride) {
    return {
      ok: true as const,
      grams: gramsOverride,
      densityAssumed: false,
      nutrients: scaleNutrients(per100(bundle), gramsOverride),
    };
  }
  const r = toGrams(quantity, unit, bundle.food, measureOptions(bundle));
  if (!r.ok) return { ok: false as const };
  return {
    ok: true as const,
    grams: r.grams,
    densityAssumed: r.densityAssumed,
    nutrients: scaleNutrients(per100(bundle), r.grams),
  };
}

const CANDIDATE_LIMIT = 40;

export function createFoodsService(repo: FoodsRepository) {
  async function ranked(userId: string, query: string, limit: number) {
    const q = normalizeForSearch(query);
    if (!q) return [];
    const candidates = await repo.candidates(userId, q, CANDIDATE_LIMIT);
    const bundles = await repo.bundles(
      userId,
      candidates.map((c) => c.foodId),
    );
    return candidates
      .flatMap((c) => {
        const bundle = bundles.get(c.foodId);
        if (!bundle) return [];
        const score = matchScore(q, {
          similarity: c.similarity,
          timesUsed: c.timesUsed,
          verified: bundle.food.isVerified,
          category: bundle.food.category,
          state: bundle.food.state,
        });
        return [{ bundle, score }];
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  return {
    async search(userId: string, q: string, limit: number) {
      return (await ranked(userId, q, limit)).map(({ bundle, score }) => ({
        ...toFoodDto(bundle),
        score,
      }));
    },

    async get(userId: string, id: string): Promise<FoodDto> {
      const bundle = (await repo.bundles(userId, [id])).get(id);
      if (!bundle) throw foodNotFound();
      return toFoodDto(bundle);
    },

    async bundle(userId: string, id: string): Promise<FoodBundle> {
      const bundle = (await repo.bundles(userId, [id])).get(id);
      if (!bundle) throw foodNotFound();
      return bundle;
    },

    /** Alimento personalizado: valores da porção de referência convertidos para 100 g/ml (P6.3). */
    async createCustom(
      userId: string,
      input: z.output<typeof customFoodInputSchema>,
    ): Promise<FoodDto> {
      const f = 100 / input.referenceAmount;
      const scale = (v: number | null | undefined) =>
        v === null || v === undefined ? null : v * f;
      const id = await repo.createCustomFood(
        userId,
        {
          namePt: input.namePt,
          nameNormalized: normalizeForSearch(input.namePt),
          brand: input.brand ?? null,
          category: input.category,
          state: 'ready',
          defaultUnit: input.referenceUnit,
          isVerified: false,
        },
        {
          kcal: input.kcal * f,
          proteinG: input.proteinG * f,
          carbsG: input.carbsG * f,
          fatG: input.fatG * f,
          fiberG: scale(input.fiberG),
          sugarG: scale(input.sugarG),
          saturatedFatG: scale(input.saturatedFatG),
          sodiumMg: scale(input.sodiumMg),
          potassiumMg: null,
          calciumMg: null,
          ironMg: null,
          cholesterolMg: null,
        },
        input.measures,
      );
      return this.get(userId, id);
    },

    async addMeasure(
      userId: string,
      foodId: string,
      m: { unitCode: FoodBundle['measures'][number]['unitCode']; labelPt: string; grams: number },
    ): Promise<FoodDto> {
      await this.bundle(userId, foodId);
      await repo.addUserMeasure(userId, foodId, m);
      return this.get(userId, foodId);
    },

    /** Casa itens interpretados com o banco (P6.2 passos 4–6), sem gravar nada. */
    async matchItems(
      userId: string,
      items: readonly ParsedItem[],
    ): Promise<{ items: ParsedItemDto[]; totals: Nutrients }> {
      const out: ParsedItemDto[] = [];
      for (const item of items) {
        const results = await ranked(userId, item.foodQuery, 4);
        const best = results[0];
        const confidence = best ? confidenceBand(best.score) : 'choose';
        // < 0,45: não seleciona; pede escolha entre as alternativas.
        const chosen = best && confidence !== 'choose' ? best : null;
        const portion = chosen ? computePortion(chosen.bundle, item.quantity, item.unit) : null;
        out.push({
          ...item,
          match: chosen ? toFoodDto(chosen.bundle) : null,
          score: best?.score ?? null,
          confidence,
          alternatives: results
            .filter((r) => r !== chosen)
            .slice(0, 3)
            .map((r) => toFoodDto(r.bundle)),
          grams: portion?.ok ? portion.grams : null,
          densityAssumed: portion?.ok ? portion.densityAssumed : false,
          nutrients: portion?.ok ? portion.nutrients : null,
          error: !chosen ? 'FOOD_NOT_FOUND' : portion?.ok ? null : 'UNIT_NOT_CONVERTIBLE',
        });
      }
      return {
        items: out,
        totals: sumNutrients(out.flatMap((i) => (i.nutrients ? [i.nutrients] : []))),
      };
    },

    recordUsage: repo.recordUsage.bind(repo),
    addUserMeasure: repo.addUserMeasure.bind(repo),
    addPersonalAlias: repo.addPersonalAlias.bind(repo),
    addParserFeedback: repo.addParserFeedback.bind(repo),
  };
}

export type FoodsService = ReturnType<typeof createFoodsService>;
