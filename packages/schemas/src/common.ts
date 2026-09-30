import { z } from 'zod';

/** Dia do usuário `YYYY-MM-DD` (P3.5). */
export const dateSchema = z.iso.date({ message: 'Data inválida (use AAAA-MM-DD)' });

export const idParamSchema = z.object({ id: z.uuid() });

export const dateRangeQuerySchema = z
  .object({ from: dateSchema, to: dateSchema })
  .refine((q) => q.from <= q.to, {
    message: 'A data inicial deve ser anterior à final',
    path: ['from'],
  });

/** Paginação por cursor (P3.5): limite padrão 50. */
export const paginationQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const range = (min: number, max: number, label: string) =>
  z
    .number({ message: `${label} deve ser um número` })
    .min(min, { message: `${label} deve estar entre ${min} e ${max}` })
    .max(max, { message: `${label} deve estar entre ${min} e ${max}` });

/** Faixas de validação padrão (P3.6). */
export const ranges = {
  weightKg: () => range(25, 350, 'Peso'),
  heightCm: () => range(100, 250, 'Altura'),
  bodyFatPct: () => range(2, 70, 'Gordura corporal'),
  scale1to5: (label: string) =>
    z
      .number()
      .int()
      .min(1)
      .max(5, { message: `${label} deve estar entre 1 e 5` }),
  circumferenceCm: (label: string) => range(10, 250, label),
};
