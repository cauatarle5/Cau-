import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import { ApiError } from '@/lib/api';

/** Distribui `errors[]` da API nos campos do formulário; devolve a mensagem geral. */
export function applyApiErrors<T extends FieldValues>(
  error: unknown,
  fields: readonly Path<T>[],
  setError: UseFormSetError<T>,
): string {
  if (!(error instanceof ApiError)) return 'Algo deu errado. Tente novamente.';
  let assigned = false;
  for (const fieldError of error.problem.errors ?? []) {
    const field = fields.find((f) => f === fieldError.field);
    if (field) {
      setError(field, { message: fieldError.message });
      assigned = true;
    }
  }
  return assigned ? '' : (error.problem.detail ?? error.problem.title);
}
