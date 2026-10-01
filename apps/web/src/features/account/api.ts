import { ApiError, apiRequest, problemFrom } from '@/lib/api';
import type { DeleteAccountInput } from '@atlas/schemas';

export const accountApi = {
  /** Baixa a exportação completa como arquivo JSON. */
  async downloadExport(): Promise<void> {
    const res = await fetch('/api/v1/account/export', { credentials: 'same-origin' });
    if (!res.ok) {
      throw new ApiError(await problemFrom(res));
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
    apiRequest<null>('/account', { method: 'DELETE', body: input }),
};
