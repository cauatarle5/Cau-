'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { FullPageLoading, RequireAuth } from '@/features/auth/components/require-auth';
import { useProfile } from '@/features/profile/hooks/use-profile';
import { isNetworkError } from '@/lib/api';
import { lastOnboardingComplete, rememberOnboarding } from '@/offline/last-session';

/** Enquanto o onboarding não estiver completo, leva para /onboarding (ADR-020). */
function OnboardingGate({ userName, children }: { userName: string; children: ReactNode }) {
  const router = useRouter();
  const profile = useProfile();
  const complete = profile.data?.onboardingComplete;
  const incomplete = complete === false;

  useEffect(() => {
    if (incomplete) router.replace('/onboarding');
  }, [incomplete, router]);
  useEffect(() => {
    if (complete !== undefined) rememberOnboarding(complete);
  }, [complete]);

  // Sem rede: o onboarding já concluído neste aparelho basta para abrir o app (ADR-060).
  const offlineOk = isNetworkError(profile.error) && lastOnboardingComplete();
  if ((!profile.data && !offlineOk) || incomplete) return <FullPageLoading />;
  return <AppShell userName={userName}>{children}</AppShell>;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      {(user) => <OnboardingGate userName={user.name}>{children}</OnboardingGate>}
    </RequireAuth>
  );
}
