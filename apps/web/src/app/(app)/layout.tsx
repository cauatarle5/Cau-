'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { FullPageLoading, RequireAuth } from '@/features/auth/components/require-auth';
import { useProfile } from '@/features/profile/hooks/use-profile';

/** Enquanto o onboarding não estiver completo, leva para /onboarding (ADR-020). */
function OnboardingGate({ userName, children }: { userName: string; children: ReactNode }) {
  const router = useRouter();
  const profile = useProfile();
  const incomplete = profile.data?.onboardingComplete === false;

  useEffect(() => {
    if (incomplete) router.replace('/onboarding');
  }, [incomplete, router]);

  if (!profile.data || incomplete) return <FullPageLoading />;
  return <AppShell userName={userName}>{children}</AppShell>;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      {(user) => <OnboardingGate userName={user.name}>{children}</OnboardingGate>}
    </RequireAuth>
  );
}
