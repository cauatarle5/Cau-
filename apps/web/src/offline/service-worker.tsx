'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const enabled = () => process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator;

function cachePage(url: string) {
  navigator.serviceWorker.controller?.postMessage({ type: 'CACHE_PAGE', url });
}

/**
 * Registra o service worker (só no build de produção; em dev os arquivos mudam a cada edição) e
 * pede para guardar cada página visitada, inclusive as abertas pelo router no cliente (ADR-060).
 */
export function ServiceWorker() {
  // `null` só fora do App Router (a pasta `pages` muda o tipo); aqui é sempre uma rota do app.
  const pathname = usePathname() ?? '/';

  useEffect(() => {
    if (!enabled()) return;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch(() => undefined);
    const onControl = () => {
      cachePage(location.pathname);
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControl);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControl);
    };
  }, []);

  useEffect(() => {
    if (enabled() && navigator.onLine) cachePage(pathname);
  }, [pathname]);

  return null;
}
