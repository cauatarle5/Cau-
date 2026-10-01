import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

import type { ErrorCode, ProblemDetails } from '@atlas/schemas';

import { AppError } from '../lib/errors';
import { PG_FOREIGN_KEY_VIOLATION, pgErrorCode } from '../lib/pg';

const PROBLEM_TYPE_BASE = 'https://atlas.local/problems/';

function send(
  reply: FastifyReply,
  request: FastifyRequest,
  problem: Omit<ProblemDetails, 'type' | 'requestId'> & { code: ErrorCode },
) {
  const body: ProblemDetails = {
    type: `${PROBLEM_TYPE_BASE}${problem.code.toLowerCase().replaceAll('_', '-')}`,
    ...problem,
    requestId: request.id,
  };
  return reply.status(problem.status).type('application/problem+json').send(body);
}

/** Pipeline de erros: tudo sai como RFC 7807 com `code` estável. */
export const errorsPlugin = fp((app: FastifyInstance) => {
  app.setNotFoundHandler((request, reply) =>
    send(reply, request, {
      status: 404,
      code: 'NOT_FOUND',
      title: 'Recurso não encontrado',
      detail: `${request.method} ${request.url.split('?')[0] ?? ''} não existe.`,
    }),
  );

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      return send(reply, request, {
        status: error.status,
        code: error.code,
        title: error.title,
        ...(error.detail ? { detail: error.detail } : {}),
        ...(error.errors ? { errors: error.errors } : {}),
      });
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      return send(reply, request, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Dados inválidos',
        detail: 'Verifique os campos destacados.',
        errors: error.validation.map((v) => ({
          field: v.instancePath.replace(/^\//, '').replaceAll('/', '.') || v.schemaPath,
          message: v.message ?? 'Valor inválido',
        })),
      });
    }

    // Referência a registro inexistente (FK): erro do cliente, não 500.
    if (pgErrorCode(error) === PG_FOREIGN_KEY_VIOLATION) {
      return send(reply, request, {
        status: 400,
        code: 'BAD_REQUEST',
        title: 'Referência inválida',
        detail: 'Um dos registros informados não existe.',
      });
    }

    if (error.statusCode === 429) {
      return send(reply, request, {
        status: 429,
        code: 'RATE_LIMITED',
        title: 'Muitas tentativas',
        detail: 'Aguarde um minuto e tente novamente.',
      });
    }

    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      // Erros do próprio Fastify (JSON malformado, content-type, corpo grande).
      return send(reply, request, {
        status: error.statusCode,
        code: 'BAD_REQUEST',
        title: 'Requisição inválida',
        detail: error.message,
      });
    }

    request.log.error({ err: error }, 'unhandled error');
    return send(reply, request, {
      status: 500,
      code: 'INTERNAL_ERROR',
      title: 'Erro interno',
      detail: 'Algo deu errado. Tente novamente.',
    });
  });
});
