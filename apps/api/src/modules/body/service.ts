import type { z } from 'zod';

import {
  isUnusualWeightChange,
  latestTrend,
  weightTrend,
  type TrendPoint,
  type WeighIn,
} from '@atlas/core';
import type { BodyMeasurementRow } from '@atlas/db';
import {
  MEASUREMENT_VALUE_FIELDS,
  type BodyMeasurement,
  type BodyTrendResponse,
  type MeasurementWarning,
  type bodyMeasurementInputSchema,
  type bodyMeasurementPatchSchema,
} from '@atlas/schemas';

import { notFound, validationError } from '../../lib/errors';

import type { BodyRepository, MeasurementValues } from './repository';

type CreateInput = z.output<typeof bodyMeasurementInputSchema>;
type PatchInput = z.output<typeof bodyMeasurementPatchSchema>;

export function toBodyMeasurementDto(row: BodyMeasurementRow): BodyMeasurement {
  return {
    id: row.id,
    date: row.date,
    measuredAt: row.measuredAt.toISOString(),
    weightKg: row.weightKg,
    bodyFatPct: row.bodyFatPct,
    bodyFatMethod: row.bodyFatMethod,
    waistCm: row.waistCm,
    hipCm: row.hipCm,
    chestCm: row.chestCm,
    armLCm: row.armLCm,
    armRCm: row.armRCm,
    thighLCm: row.thighLCm,
    thighRCm: row.thighRCm,
    calfCm: row.calfCm,
    neckCm: row.neckCm,
    notes: row.notes,
  };
}

function toValues(input: Partial<CreateInput>): Partial<MeasurementValues> {
  const { measuredAt, ...rest } = input;
  return { ...rest, ...(measuredAt ? { measuredAt: new Date(measuredAt) } : {}) };
}

const encodeCursor = (row: { date: string; id: string }) =>
  Buffer.from(JSON.stringify({ date: row.date, id: row.id })).toString('base64url');

function decodeCursor(cursor: string | undefined): { date: string; id: string } | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as {
      date?: unknown;
      id?: unknown;
    };
    if (typeof parsed.date === 'string' && typeof parsed.id === 'string')
      return { date: parsed.date, id: parsed.id };
  } catch {
    // cai no erro abaixo
  }
  throw validationError([{ field: 'cursor', message: 'Cursor inválido' }]);
}

const toWeighIns = (rows: { date: string; weightKg: number | null }[]): WeighIn[] =>
  rows.flatMap((r) => (r.weightKg === null ? [] : [{ date: r.date, weightKg: r.weightKg }]));

export function createBodyService(repo: BodyRepository) {
  return {
    async create(userId: string, input: CreateInput) {
      const warnings: MeasurementWarning[] = [];
      if (input.weightKg !== undefined && input.weightKg !== null) {
        const previous = latestTrend(
          toWeighIns(await repo.weighIns(userId)).filter((w) => w.date <= input.date),
        );
        if (
          previous &&
          isUnusualWeightChange(previous, { date: input.date, weightKg: input.weightKg })
        ) {
          warnings.push('WEIGHT_CHANGE_UNUSUAL');
        }
      }
      const row = await repo.create(userId, toValues(input) as MeasurementValues);
      return { measurement: toBodyMeasurementDto(row), warnings };
    },

    async list(userId: string, limit: number, cursor: string | undefined) {
      const rows = await repo.list(userId, limit + 1, decodeCursor(cursor));
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map(toBodyMeasurementDto),
        nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
      };
    },

    async update(userId: string, id: string, patch: PatchInput) {
      const current = await repo.get(userId, id);
      if (!current) throw notFound('Medida');
      const merged = { ...current, ...patch };
      if (!MEASUREMENT_VALUE_FIELDS.some((f) => merged[f] !== null)) {
        throw validationError([{ field: 'weightKg', message: 'Informe ao menos uma medida' }]);
      }
      if (merged.bodyFatPct !== null && !merged.bodyFatMethod) {
        throw validationError([
          { field: 'bodyFatMethod', message: 'Informe o método da medição de gordura' },
        ]);
      }
      const row = await repo.update(userId, id, toValues(patch));
      if (!row) throw notFound('Medida');
      return toBodyMeasurementDto(row);
    },

    async remove(userId: string, id: string) {
      if (!(await repo.softDelete(userId, id))) throw notFound('Medida');
    },

    async trend(userId: string, from: string, to: string): Promise<BodyTrendResponse> {
      const all = weightTrend(toWeighIns(await repo.weighIns(userId)));
      const upToEnd = all.filter((p) => p.date <= to);
      return { points: upToEnd.filter((p) => p.date >= from), latest: upToEnd.at(-1) ?? null };
    },

    async latestTrend(userId: string): Promise<TrendPoint | null> {
      return latestTrend(toWeighIns(await repo.weighIns(userId)));
    },

    async hasWeighIn(userId: string): Promise<boolean> {
      return (await repo.weighIns(userId)).length > 0;
    },

    latestBodyFat(userId: string) {
      return repo.latestBodyFat(userId);
    },
  };
}

export type BodyService = ReturnType<typeof createBodyService>;
