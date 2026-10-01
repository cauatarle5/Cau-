'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { ApiError, isNetworkError } from '@/lib/api';
import { setOfflineUser } from '@/offline/kv';
import { forgetSession, lastUser, rememberUser } from '@/offline/last-session';
import type { UserPublic } from '@atlas/schemas';

import { useMe } from '../hooks/use-auth';

export function FullPageLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
      <span className="sr-only">Carregando…</span>
    </main>
  );
}

export function FullPageError({ message }: { message: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <p role="alert" className="text-sm text-destructive">
        {message}
      </p>
    </main>
  );
}

/** Renderiza os filhos só com sessão válida; sem sessão, vai para /entrar. */
export function RequireAuth({ children }: { children: (user: UserPublic) => ReactNode }) {
  const router = useRouter();
  const me = useMe();
  const unauthenticated = me.error instanceof ApiError && me.error.status === 401;

  useEffect(() => {
    if (unauthenticated) {
      forgetSession();
      router.replace('/entrar');
    }
  }, [unauthenticated, router]);

  // Sem rede: segue com o último usuário deste aparelho (treino ativo offline, ADR-060).
  const offlineUser = isNetworkError(me.error) ? lastUser() : null;
  const user = me.data?.user ?? offlineUser;

  // Dados offline (fila e treino ativo) ficam separados por usuário (ADR-034).
  const userId = user?.id;
  useEffect(() => {
    if (userId) setOfflineUser(userId);
  }, [userId]);
  const fresh = me.data?.user;
  useEffect(() => {
    if (fresh) rememberUser(fresh);
  }, [fresh]);

  if (user) return <>{children(user)}</>;
  if (me.error && !unauthenticated)
    return <FullPageError message="Não foi possível carregar sua conta. Recarregue a página." />;
  return <FullPageLoading />;
}
