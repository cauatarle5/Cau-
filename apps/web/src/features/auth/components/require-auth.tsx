'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { ApiError } from '@/lib/api';
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
    if (unauthenticated) router.replace('/entrar');
  }, [unauthenticated, router]);

  if (me.data) return <>{children(me.data.user)}</>;
  if (me.error && !unauthenticated)
    return <FullPageError message="Não foi possível carregar sua conta. Recarregue a página." />;
  return <FullPageLoading />;
}
