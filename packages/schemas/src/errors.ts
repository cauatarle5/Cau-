import { z } from 'zod';

/** Códigos de erro estáveis da API (RFC 7807 `code`). */
export const errorCodes = [
  'VALIDATION_ERROR',
  'BAD_REQUEST',
  'NOT_FOUND',
  'UNAUTHORIZED',
  'ORIGIN_FORBIDDEN',
  'RATE_LIMITED',
  'EMAIL_TAKEN',
  'INVALID_CREDENTIALS',
  'FOOD_NOT_FOUND',
  'UNIT_NOT_CONVERTIBLE',
  'IDEMPOTENCY_KEY_REUSED',
  'AI_UNAVAILABLE',
  'AI_DAILY_LIMIT',
  'AI_ERROR',
  'PROPOSAL_NOT_PENDING',
  'INTERNAL_ERROR',
] as const;

export const errorCodeSchema = z.enum(errorCodes);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const fieldErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
});

export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  code: z.string(),
  errors: z.array(fieldErrorSchema).optional(),
  requestId: z.string().optional(),
});
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
