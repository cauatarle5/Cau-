import { ApiError, apiRequest } from '@/lib/api';
import { problemDetailsSchema, type DeleteAccountInput } from '@atlas/schemas';

export const accountApi = {
  /** Baixa a exportação completa como arquivo JSON. */
  async downloadExport(): Promise<void> {
    const res = await fetch('/api/v1/account/export', { credentials: 'same-origin' });
    if (!res.ok) {
      const parsed = problemDetailsSchema.safeParse(await res.json().catch(() => null));
      throw new ApiError(
        parsed.success
          ? parsed.data
          : {
              type: 'about:blank',
              title: 'Falha na exportação',
              status: res.status,
              code: 'INTERNAL_ERROR',
              detail: 'Não foi possível exportar seus dados. Tente novamente.',
            },
      );
    }
    const name =
      /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ??
      'atlas-dados.json';
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  delete: (input: DeleteAccountInput) =>
    apiRequest('/account', null, { method: 'DELETE', body: input }),
};
