import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'E-mail inválido' }).max(254));

export const passwordSchema = z
  .string()
  .min(8, { message: 'A senha deve ter pelo menos 8 caracteres' })
  .max(128, { message: 'A senha deve ter no máximo 128 caracteres' });

export const registerInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'Informe seu nome' })
    .max(100, { message: 'Nome muito longo' }),
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: 'Informe sua senha' }).max(128),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const userPublicSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  timezone: z.string(),
  locale: z.string(),
});
export type UserPublic = z.infer<typeof userPublicSchema>;

export const authUserResponseSchema = z.object({ user: userPublicSchema });
export type AuthUserResponse = z.infer<typeof authUserResponseSchema>;

/** Exclusão de conta (LGPD): senha atual e a palavra de confirmação. */
export const deleteAccountInputSchema = z.object({
  password: z.string().min(1, { message: 'Informe sua senha' }).max(128),
  confirmation: z.literal('EXCLUIR', { message: 'Digite EXCLUIR para confirmar' }),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountInputSchema>;

/** Exportação completa (LGPD): uma lista de linhas por tabela. */
export const accountExportSchema = z.object({
  exportedAt: z.string(),
  format: z.literal('atlas-export-v1'),
  user: z.record(z.string(), z.unknown()),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});
export type AccountExport = z.infer<typeof accountExportSchema>;
