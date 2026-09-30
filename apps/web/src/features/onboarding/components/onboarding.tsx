'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { FullPageLoading } from '@/features/auth/components/require-auth';
import { useMeasurements } from '@/features/body/hooks/use-body';
import { TargetsCard } from '@/features/nutrition/components/targets-card';
import {
  useAvailability,
  useEquipment,
  useGoals,
  useLimitations,
  useProfile,
  useSports,
} from '@/features/profile/hooks/use-profile';
import { useToday } from '@/lib/use-today';

import { ONBOARDING_STEPS, useOnboarding } from '../store';

import { StepBasics } from './step-basics';
import { StepEquipment } from './step-equipment';
import { StepGoal } from './step-goal';
import { StepLimitations } from './step-limitations';
import { StepRoutine } from './step-routine';
import { StepSports } from './step-sports';

function Result() {
  const router = useRouter();
  const qc = useQueryClient();
  const today = useToday();
  const back = useOnboarding((s) => s.back);
  return (
    <div className="space-y-4">
      <TargetsCard date={today} />
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={back}>
          Voltar
        </Button>
        <Button
          type="button"
          className="flex-1"
          onClick={() => {
            void qc.invalidateQueries().then(() => {
              router.replace('/hoje');
            });
          }}
        >
          Ir para Hoje
        </Button>
      </div>
    </div>
  );
}

export function Onboarding() {
  const step = useOnboarding((s) => s.step);
  const queries = [
    useProfile(),
    useGoals(),
    useAvailability(),
    useEquipment(),
    useLimitations(),
    useSports(),
  ];
  const measurements = useMeasurements();

  if (queries.some((q) => q.isPending) || measurements.isPending) return <FullPageLoading />;

  const lastWeight =
    measurements.data?.items.find((m) => m.weightKg !== null)?.weightKg ?? undefined;
  const isResult = step >= ONBOARDING_STEPS.length;
  const title = isResult ? 'Suas metas' : ONBOARDING_STEPS[step];

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">
          {isResult ? 'Pronto!' : `Etapa ${String(step + 1)} de ${String(ONBOARDING_STEPS.length)}`}
        </p>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Progresso da configuração"
          aria-valuemin={0}
          aria-valuemax={ONBOARDING_STEPS.length}
          aria-valuenow={Math.min(step, ONBOARDING_STEPS.length)}
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{
              width: `${String((Math.min(step, ONBOARDING_STEPS.length) / ONBOARDING_STEPS.length) * 100)}%`,
            }}
          />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </header>
      {step === 0 ? <StepBasics initialWeightKg={lastWeight} /> : null}
      {step === 1 ? <StepGoal /> : null}
      {step === 2 ? <StepRoutine /> : null}
      {step === 3 ? <StepEquipment /> : null}
      {step === 4 ? <StepLimitations /> : null}
      {step === 5 ? <StepSports /> : null}
      {isResult ? <Result /> : null}
    </div>
  );
}
