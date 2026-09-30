import { z } from 'zod';

import { dateSchema, ranges } from './common';
import { targetsResponseSchema } from './nutrition';

export const sexSchema = z.enum(['male', 'female']);
export const trainingExperienceSchema = z.enum(['beginner', 'intermediate', 'advanced']);
export const activityLifestyleSchema = z.enum(['sedentary', 'light', 'moderate', 'high']);
export const primaryGoalSchema = z.enum([
  'fat_loss',
  'maintenance',
  'muscle_gain',
  'recomposition',
  'performance',
]);
export const sportCodeSchema = z.enum([
  'football',
  'futsal',
  'running',
  'cycling',
  'swimming',
  'other',
]);
export const availabilityKindSchema = z.enum(['gym', 'sport', 'any']);
export const equipmentLocationSchema = z.enum(['gym', 'home', 'other']);

const tag = z.string().trim().min(1).max(40);
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Horário inválido (HH:MM)' });

// Perfil ------------------------------------------------------------------

export const profileInputSchema = z.object({
  sex: sexSchema,
  birthDate: dateSchema.refine(
    (d) => d >= '1900-01-01' && d <= new Date().toISOString().slice(0, 10),
    {
      message: 'Data de nascimento inválida',
    },
  ),
  heightCm: ranges.heightCm(),
  trainingExperience: trainingExperienceSchema,
  trainingAgeYears: z.number().min(0).max(80).nullable().optional(),
  conditioningLevel: ranges.scale1to5('Condicionamento'),
  activityLifestyle: activityLifestyleSchema,
  aestheticPriorities: z.array(tag).max(10).default([]),
  performancePriorities: z.array(tag).max(10).default([]),
  notes: z.string().max(2000).nullable().optional(),
  /** Gestação, doença, transtorno alimentar ou medicamento que afete peso (ADR-017). */
  clinicalCondition: z.boolean().default(false),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

export const profileSchema = profileInputSchema.extend({
  aestheticPriorities: z.array(z.string()),
  performancePriorities: z.array(z.string()),
  clinicalCondition: z.boolean(),
  trainingAgeYears: z.number().nullable(),
  notes: z.string().nullable(),
});
export type Profile = z.infer<typeof profileSchema>;

export const profileResponseSchema = z.object({
  profile: profileSchema.nullable(),
  onboardingComplete: z.boolean(),
});
export type ProfileResponse = z.infer<typeof profileResponseSchema>;

// Disponibilidade ---------------------------------------------------------

export const availabilityItemSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: timeSchema.nullable().optional(),
  endTime: timeSchema.nullable().optional(),
  maxMinutes: z.number().int().min(10).max(300),
  kind: availabilityKindSchema,
});
export type AvailabilityItem = z.infer<typeof availabilityItemSchema>;

export const availabilityPutSchema = z.object({ items: z.array(availabilityItemSchema).max(21) });
export const availabilityResponseSchema = z.object({
  items: z.array(
    availabilityItemSchema.extend({
      id: z.uuid(),
      startTime: z.string().nullable(),
      endTime: z.string().nullable(),
    }),
  ),
});

// Equipamentos ------------------------------------------------------------

export const equipmentItemSchema = z.object({
  equipmentCode: z.string().min(1).max(40),
  location: equipmentLocationSchema,
});
export const equipmentPutSchema = z.object({ items: z.array(equipmentItemSchema).max(100) });
export const equipmentResponseSchema = z.object({
  catalog: z.array(z.object({ code: z.string(), namePt: z.string() })),
  items: z.array(equipmentItemSchema),
});
export type EquipmentResponse = z.infer<typeof equipmentResponseSchema>;

// Limitações --------------------------------------------------------------

export const limitationInputSchema = z.object({
  bodyRegion: z.string().trim().min(1, { message: 'Informe a região' }).max(60),
  description: z.string().trim().max(500).default(''),
  severity: z.number().int().min(1).max(3),
  contraindicatedPatterns: z.array(tag).max(20).default([]),
  active: z.boolean().default(true),
  startedAt: dateSchema.nullable().optional(),
  resolvedAt: dateSchema.nullable().optional(),
});
export const limitationPatchSchema = limitationInputSchema.partial();
export const limitationSchema = z.object({
  id: z.uuid(),
  bodyRegion: z.string(),
  description: z.string(),
  severity: z.number().int(),
  contraindicatedPatterns: z.array(z.string()),
  active: z.boolean(),
  startedAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
});
export type Limitation = z.infer<typeof limitationSchema>;
export const limitationListSchema = z.object({ items: z.array(limitationSchema) });

// Esportes ----------------------------------------------------------------

export const sportItemSchema = z.object({
  sportCode: sportCodeSchema,
  weeklyFrequency: z.number().int().min(1).max(14),
  typicalDurationMin: z.number().int().min(10).max(300),
  typicalIntensity: ranges.scale1to5('Intensidade'),
  weekdayHint: z.number().int().min(0).max(6).nullable().optional(),
});
export type SportItem = z.infer<typeof sportItemSchema>;
export const sportsPutSchema = z.object({ items: z.array(sportItemSchema).max(10) });
export const sportsResponseSchema = z.object({
  items: z.array(
    sportItemSchema.extend({ id: z.uuid(), weekdayHint: z.number().int().nullable() }),
  ),
});

// Objetivos (versionados) --------------------------------------------------

export const goalInputSchema = z.object({
  primaryGoal: primaryGoalSchema,
  targetWeightKg: ranges.weightKg().nullable().optional(),
  targetBodyFatPct: ranges.bodyFatPct().nullable().optional(),
  /** Com sinal: negativo = perder (ADR-021). */
  targetRatePctPerWeek: z.number().min(-1.5).max(1.5).nullable().optional(),
  proteinGPerKg: z.number().min(1.2).max(3.5).nullable().optional(),
  trainingFocus: z.string().trim().max(60).nullable().optional(),
});
export type GoalInput = z.infer<typeof goalInputSchema>;

export const goalSchema = z.object({
  id: z.uuid(),
  primaryGoal: primaryGoalSchema,
  targetWeightKg: z.number().nullable(),
  targetBodyFatPct: z.number().nullable(),
  targetRatePctPerWeek: z.number().nullable(),
  proteinGPerKg: z.number().nullable(),
  trainingFocus: z.string().nullable(),
  effectiveFrom: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type Goal = z.infer<typeof goalSchema>;
export const goalListSchema = z.object({ items: z.array(goalSchema) });

export const goalCreateResponseSchema = z.object({
  goal: goalSchema,
  targets: targetsResponseSchema,
});
