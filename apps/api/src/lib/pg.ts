/** Códigos de erro do Postgres usados pela aplicação. */
export const PG_UNIQUE_VIOLATION = '23505';

export function pgErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string') return code;
  return pgErrorCode((error as { cause?: unknown }).cause);
}
