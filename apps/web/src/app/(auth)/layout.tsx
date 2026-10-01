import type { ReactNode } from 'react';

import { RedirectIfAuthenticated } from '@/features/auth/components/redirect-if-authenticated';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <p className="text-center text-2xl font-semibold tracking-tight">Atlas</p>
      <RedirectIfAuthenticated>{children}</RedirectIfAuthenticated>
    </main>
  );
}
