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
