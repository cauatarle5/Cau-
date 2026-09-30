import type { ErrorCode } from '@atlas/schemas';

/** Erro de domínio convertido em RFC 7807 pelo handler global. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    public readonly title: string,
    public readonly detail?: string,
    public readonly errors?: { field: string; message: string }[],
  ) {
    super(detail ?? title);
    this.name = 'AppError';
  }
}

export const unauthorized = () =>
  new AppError(401, 'UNAUTHORIZED', 'Não autenticado', 'Faça login para continuar.');

export const notFound = (what: string) =>
  new AppError(404, 'NOT_FOUND', 'Recurso não encontrado', `${what} não encontrado.`);

export const validationError = (errors: { field: string; message: string }[]) =>
  new AppError(
    400,
    'VALIDATION_ERROR',
    'Dados inválidos',
    'Verifique os campos destacados.',
    errors,
  );
