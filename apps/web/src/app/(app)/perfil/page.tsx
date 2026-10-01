'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { PageHeader } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { AccountDataCard } from '@/features/account/components/account-data-card';
import { useLogout, useMe } from '@/features/auth/hooks/use-auth';
import { useOnboarding } from '@/features/onboarding/store';
import { useGoals, useProfile } from '@/features/profile/hooks/use-profile';
import { EXPERIENCE_LABELS, GOAL_LABELS, LIFESTYLE_LABELS } from '@/features/profile/labels';
import { formatNumber } from '@/lib/format';

export default function ProfilePage() {
  const router = useRouter();
  const me = useMe();
  const profile = useProfile().data?.profile;
  const goal = useGoals().data?.items[0];
  const logout = useLogout();
  const resetOnboarding = useOnboarding((s) => s.reset);

  const onLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => {
        router.replace('/entrar');
      },
    });
  };

  return (
    <>
      <PageHeader title="Perfil" subtitle="Dados pessoais, objetivos e preferências." />
      <div className="space-y-4">
        <Card className="space-y-4">
          <div className="space-y-1">
            <CardTitle>{me.data?.user.name}</CardTitle>
            <CardDescription>{me.data?.user.email}</CardDescription>
          </div>
          {profile ? (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Objetivo</dt>
                <dd className="font-medium">{goal ? GOAL_LABELS[goal.primaryGoal] : '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Altura</dt>
                <dd className="font-medium tabular-nums">{formatNumber(profile.heightCm)} cm</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Rotina</dt>
                <dd className="font-medium">{LIFESTYLE_LABELS[profile.activityLifestyle]}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Experiência</dt>
                <dd className="font-medium">{EXPERIENCE_LABELS[profile.trainingExperience]}</dd>
              </div>
            </dl>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="outline">
              <Link
                href="/onboarding"
                onClick={() => {
                  resetOnboarding();
                }}
              >
                Editar dados e objetivo
              </Link>
            </Button>
            <Button variant="outline" onClick={onLogout} disabled={logout.isPending}>
              Sair
            </Button>
          </div>
        </Card>
        <AccountDataCard />
      </div>
    </>
  );
}
