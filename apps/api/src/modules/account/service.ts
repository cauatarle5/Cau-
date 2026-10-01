import type { AccountExport, DeleteAccountInput } from '@atlas/schemas';

import { AppError, unauthorized } from '../../lib/errors';
import { verifyPassword } from '../auth/password';

import type { AccountRepository } from './repository';

export function createAccountService(repo: AccountRepository) {
  return {
    /** Exportação completa em JSON (P3.4, LGPD). */
    async export(userId: string): Promise<AccountExport> {
      const user = await repo.findUser(userId);
      if (!user) throw unauthorized();
      const publicUser: Record<string, unknown> = { ...user };
      delete publicUser.passwordHash;
      return {
        exportedAt: new Date().toISOString(),
        format: 'atlas-export-v1',
        user: publicUser,
        tables: await repo.exportTables(userId),
      };
    },

    /** Exclusão definitiva com remoção em cascata; exige a senha atual. */
    async delete(userId: string, input: DeleteAccountInput): Promise<void> {
      const user = await repo.findUser(userId);
      if (!user) throw unauthorized();
      if (!(await verifyPassword(user.passwordHash, input.password)))
        throw new AppError(400, 'INVALID_PASSWORD', 'Senha incorreta', 'A senha não confere.', [
          { field: 'password', message: 'Senha incorreta' },
        ]);
      await repo.deleteUser(userId);
    },
  };
}

export type AccountService = ReturnType<typeof createAccountService>;
