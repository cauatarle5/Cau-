'use client';

import type { ReactNode } from 'react';

import { RequireAuth } from '@/features/auth/components/require-auth';

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      {() => <main className="mx-auto w-full max-w-lg px-4 pb-10 pt-6">{children}</main>}
    </RequireAuth>
  );
}
