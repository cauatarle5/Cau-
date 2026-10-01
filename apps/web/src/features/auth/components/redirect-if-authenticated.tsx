'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { useMe } from '../hooks/use-auth';

/** Em /entrar e /cadastro: quem já tem sessão vai direto para /hoje. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const router = useRouter();
  const me = useMe();
  const loggedIn = me.data !== undefined;

  useEffect(() => {
    if (loggedIn) router.replace('/hoje');
  }, [loggedIn, router]);

  return <>{children}</>;
}
