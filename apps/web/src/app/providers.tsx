'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';

import { ApiError, isNetworkError } from '@/lib/api';
import { startSync } from '@/offline/queue';
import { ServiceWorker } from '@/offline/service-worker';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Sem rede, não insiste: as telas caem logo nos dados do aparelho (ADR-060).
            retry: (failureCount, error) =>
              !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
              !(isNetworkError(error) && !navigator.onLine) &&
              failureCount < 2,
          },
        },
      }),
  );
  useEffect(() => {
    startSync();
  }, []);
  return (
    <QueryClientProvider client={client}>
      <ServiceWorker />
      {children}
    </QueryClientProvider>
  );
}
