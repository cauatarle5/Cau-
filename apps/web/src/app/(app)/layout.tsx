'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { useMe } from '@/features/auth/hooks/use-auth';
import { ApiError } from '@/lib/api';

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const me = useMe();
  const unauthenticated = me.error instanceof ApiError && me.error.status === 401;

  useEffect(() => {
    if (unauthenticated) router.replace('/entrar');
  }, [unauthenticated, router]);

  if (me.data) return <AppShell userName={me.data.user.name}>{children}</AppShell>;

  if (me.error && !unauthenticated) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar sua conta. Recarregue a página.
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
      <span className="sr-only">Carregando…</span>
    </main>
  );
}
