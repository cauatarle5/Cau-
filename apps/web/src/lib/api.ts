import type { z } from 'zod';

import type { ProblemDetails } from '@atlas/schemas';

import { takePrefetch } from './prefetch';

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

/**
 * Corpo de erro RFC 7807 da API, reconhecido por estrutura (sem zod no bundle, ADR-062); qualquer
 * outra coisa vira o erro genérico de comunicação.
 */
export function toProblem(body: unknown, status: number): ProblemDetails {
  if (body && typeof body === 'object') {
    const b = body as Partial<ProblemDetails>;
    if (typeof b.title === 'string' && typeof b.status === 'number' && typeof b.code === 'string')
      return b as ProblemDetails;
  }
  return networkProblem(status);
}

/** Lê o corpo de uma resposta de erro como ProblemDetails. */
export async function problemFrom(res: Response): Promise<ProblemDetails> {
  return toProblem(await res.json().catch(() => null), res.status);
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

/** Tipo da resposta: o schema compartilhado entra só como tipo (ADR-062). */
type Result<S> = S extends z.ZodType ? z.infer<S> : null;

/**
 * Chamada tipada à API (`/api/v1`, mesmo origin via proxy do Next).
 * O tipo vem do schema compartilhado; a validação é feita na API (ADR-013, ADR-062).
 */
export async function apiRequest<S extends z.ZodType | null>(
  path: string,
  options: RequestOptions = {},
): Promise<Result<S>> {
  let res: Response;
  try {
    const prefetched = (options.method ?? 'GET') === 'GET' ? takePrefetch(path) : undefined;
    res = await (prefetched ??
      fetch(`/api/v1${path}`, {
        method: options.method ?? 'GET',
        credentials: 'same-origin',
        headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      }));
  } catch {
    throw new ApiError(networkProblem(0));
  }

  if (!res.ok) throw new ApiError(await problemFrom(res));
  if (res.status === 204) return null as Result<S>;
  // A API já validou e serializou pelo mesmo schema (fastify-type-provider-zod).
  return (await res.json()) as Result<S>;
}

/** Sem resposta do servidor (sem rede): o app pode seguir com dados do aparelho (ADR-060). */
export const isNetworkError = (error: unknown) => error instanceof ApiError && error.status === 0;
