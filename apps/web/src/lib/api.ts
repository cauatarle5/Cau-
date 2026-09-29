import type { z } from 'zod';

import { problemDetailsSchema, type ProblemDetails } from '@atlas/schemas';

/** Erro da API já no formato RFC 7807. */
export class ApiError extends Error {
  constructor(public readonly problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
  }

  get status() {
    return this.problem.status;
  }
}

const networkProblem = (status: number): ProblemDetails => ({
  type: 'about:blank',
  title: 'Falha de comunicação',
  status,
  code: 'INTERNAL_ERROR',
  detail: 'Não foi possível falar com o servidor. Tente novamente.',
});

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

/**
 * Chamada tipada à API (`/api/v1`, mesmo origin via proxy do Next).
 * A resposta é validada pelo schema compartilhado (ADR-013).
 */
export async function apiRequest<S extends z.ZodType | null>(
  path: string,
  schema: S,
  options: RequestOptions = {},
): Promise<S extends z.ZodType ? z.infer<S> : null> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(networkProblem(0));
  }

  if (!res.ok) {
    const parsed = problemDetailsSchema.safeParse(await res.json().catch(() => null));
    throw new ApiError(parsed.success ? parsed.data : networkProblem(res.status));
  }

  if (schema === null || res.status === 204) {
    return null as S extends z.ZodType ? z.infer<S> : null;
  }
  return schema.parse(await res.json()) as S extends z.ZodType ? z.infer<S> : null;
}
