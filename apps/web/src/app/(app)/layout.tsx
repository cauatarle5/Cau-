'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { FullPageLoading, RequireAuth } from '@/features/auth/components/require-auth';
import { useProfile } from '@/features/profile/hooks/use-profile';
import { isNetworkError } from '@/lib/api';
import { lastOnboardingComplete, rememberOnboarding } from '@/offline/last-session';
import { nextOfflineMode } from '@/offline/offline-mode';

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
  const [offline, setOffline] = useState(false);
  const nextOffline = nextOfflineMode(offline, {
    networkError: isNetworkError(profile.error),
    hasData: profile.data !== undefined,
  });
  if (nextOffline !== offline) setOffline(nextOffline);
  const offlineOk = offline && lastOnboardingComplete();
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
