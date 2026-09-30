'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { ChoiceGroup } from '@/components/ui/choice-group';
import { FormField } from '@/features/auth/components/form-field';
import { profileApi } from '@/features/profile/api';
import { useGoals } from '@/features/profile/hooks/use-profile';
import { GOAL_HINTS, GOAL_LABELS } from '@/features/profile/labels';
import type { GoalInput } from '@atlas/schemas';

import { useOnboarding } from '../store';

import { errorMessage, StepNav } from './step-nav';

type PrimaryGoal = GoalInput['primaryGoal'];
const GOALS = ['fat_loss', 'maintenance', 'muscle_gain', 'recomposition', 'performance'] as const;

export function StepGoal() {
  const qc = useQueryClient();
  const current = useGoals().data?.items[0];
  const { next, back, goalKey, setGoalKey } = useOnboarding();
  const [goal, setGoal] = useState<PrimaryGoal | undefined>(current?.primaryGoal);
  const [targetWeight, setTargetWeight] = useState(current?.targetWeightKg?.toString() ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const onSubmit = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (!goal) {
      setError('Escolha um objetivo');
      return;
    }
    // Nova versão preserva o que não é editado aqui; o ritmo só vale para o mesmo objetivo.
    const input: GoalInput = {
      primaryGoal: goal,
      targetWeightKg: targetWeight ? Number(targetWeight) : null,
      targetBodyFatPct: current?.targetBodyFatPct ?? null,
      targetRatePctPerWeek: current?.primaryGoal === goal ? current.targetRatePctPerWeek : null,
      proteinGPerKg: current?.proteinGPerKg ?? null,
      trainingFocus: current?.trainingFocus ?? null,
    };
    const key = JSON.stringify(input);
    const unchanged =
      key === goalKey ||
      (current &&
        current.primaryGoal === goal &&
        (current.targetWeightKg ?? null) === input.targetWeightKg);
    setPending(true);
    setError(undefined);
    try {
      // Objetivos são versionados: só grava nova versão se mudou.
      if (!unchanged) {
        await profileApi.createGoal(input);
        setGoalKey(key);
        await qc.invalidateQueries();
      }
      next();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-5" noValidate>
      <ChoiceGroup
        name="primaryGoal"
        legend="Qual é o seu objetivo principal?"
        columns={1}
        options={GOALS.map((g) => ({ value: g, label: GOAL_LABELS[g], hint: GOAL_HINTS[g] }))}
        value={goal}
        onChange={setGoal}
      />
      <FormField
        id="targetWeightKg"
        label="Peso desejado (kg, opcional)"
        type="number"
        step="0.1"
        inputMode="decimal"
        value={targetWeight}
        onChange={(e) => {
          setTargetWeight(e.target.value);
        }}
      />
      <StepNav onBack={back} pending={pending} error={error} />
    </form>
  );
}
