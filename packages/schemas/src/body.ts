import { z } from 'zod';

import { dateSchema, ranges } from './common';

export const bodyFatMethodSchema = z.enum(['bioimpedance', 'skinfold', 'dexa', 'visual', 'other']);

const cm = (label: string) => ranges.circumferenceCm(label).nullable().optional();

const measurementFields = z.object({
  date: dateSchema,
  measuredAt: z.iso.datetime({ offset: true }).optional(),
  weightKg: ranges.weightKg().nullable().optional(),
  bodyFatPct: ranges.bodyFatPct().nullable().optional(),
  bodyFatMethod: bodyFatMethodSchema.nullable().optional(),
  waistCm: cm('Cintura'),
  hipCm: cm('Quadril'),
  chestCm: cm('Peito'),
  armLCm: cm('Braço esquerdo'),
  armRCm: cm('Braço direito'),
  thighLCm: cm('Coxa esquerda'),
  thighRCm: cm('Coxa direita'),
  calfCm: cm('Panturrilha'),
  neckCm: cm('Pescoço'),
  notes: z.string().max(1000).nullable().optional(),
});

export const MEASUREMENT_VALUE_FIELDS = [
  'weightKg',
  'bodyFatPct',
  'waistCm',
  'hipCm',
  'chestCm',
  'armLCm',
  'armRCm',
  'thighLCm',
  'thighRCm',
  'calfCm',
  'neckCm',
] as const;

type MeasurementLike = Partial<
  Record<(typeof MEASUREMENT_VALUE_FIELDS)[number], number | null | undefined>
> & {
  bodyFatPct?: number | null | undefined;
  bodyFatMethod?: string | null | undefined;
};

const hasAnyValue = (m: MeasurementLike) =>
  MEASUREMENT_VALUE_FIELDS.some((f) => m[f] !== undefined && m[f] !== null);

/** Todos opcionais exceto a data; ao menos um valor (DATA_MODEL 4.2). */
export const bodyMeasurementInputSchema = measurementFields
  .refine(hasAnyValue, { message: 'Informe ao menos uma medida', path: ['weightKg'] })
  .refine((m) => m.bodyFatPct === undefined || m.bodyFatPct === null || !!m.bodyFatMethod, {
    message: 'Informe o método da medição de gordura',
    path: ['bodyFatMethod'],
  });
export type BodyMeasurementInput = z.input<typeof bodyMeasurementInputSchema>;

export const bodyMeasurementPatchSchema = measurementFields.partial();

const nullableNumber = z.number().nullable();
export const bodyMeasurementSchema = z.object({
  id: z.uuid(),
  date: z.string(),
  measuredAt: z.iso.datetime({ offset: true }),
  weightKg: nullableNumber,
  bodyFatPct: nullableNumber,
  bodyFatMethod: bodyFatMethodSchema.nullable(),
  waistCm: nullableNumber,
  hipCm: nullableNumber,
  chestCm: nullableNumber,
  armLCm: nullableNumber,
  armRCm: nullableNumber,
  thighLCm: nullableNumber,
  thighRCm: nullableNumber,
  calfCm: nullableNumber,
  neckCm: nullableNumber,
  notes: z.string().nullable(),
});
export type BodyMeasurement = z.infer<typeof bodyMeasurementSchema>;

export const measurementWarningSchema = z.enum(['WEIGHT_CHANGE_UNUSUAL']);
export type MeasurementWarning = z.infer<typeof measurementWarningSchema>;

export const bodyMeasurementCreateResponseSchema = z.object({
  measurement: bodyMeasurementSchema,
  warnings: z.array(measurementWarningSchema),
});

export const bodyMeasurementListSchema = z.object({
  items: z.array(bodyMeasurementSchema),
  nextCursor: z.string().nullable(),
});

export const trendPointSchema = z.object({
  date: z.string(),
  weightKg: z.number(),
  trendKg: z.number(),
});
export type TrendPointDto = z.infer<typeof trendPointSchema>;
export const bodyTrendResponseSchema = z.object({
  points: z.array(trendPointSchema),
  latest: trendPointSchema.nullable(),
});
export type BodyTrendResponse = z.infer<typeof bodyTrendResponseSchema>;
