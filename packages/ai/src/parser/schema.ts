import { z } from 'zod';

import { HOUSEHOLD_UNITS } from '@atlas/core';

export const AI_UNITS = ['g', 'kg', 'ml', 'l', ...HOUSEHOLD_UNITS] as const;

/** Saída da IA: só estrutura, nunca nutrientes (P6.2 passo 2, ADR-025). */
export const aiParsedSchema = z.object({
  items: z
    .array(
      z.object({
        raw: z.string(),
        food_query: z.string(),
        quantity: z.number(),
        unit: z.enum(AI_UNITS).nullable(),
        preparation: z.string().nullable(),
        brand: z.string().nullable(),
      }),
    )
    .max(30),
});
export type AiParsed = z.infer<typeof aiParsedSchema>;
