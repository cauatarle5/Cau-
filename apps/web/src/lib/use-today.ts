'use client';

import { useMe } from '@/features/auth/hooks/use-auth';
import { localDate } from '@atlas/core';

/** Dia de hoje no fuso do usuário (PROMPT_MESTRE 1.10). */
export function useToday(): string {
  const me = useMe();
  return localDate(new Date(), me.data?.user.timezone ?? 'America/Sao_Paulo');
}
