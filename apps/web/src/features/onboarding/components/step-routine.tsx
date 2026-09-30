'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { profileApi } from '@/features/profile/api';
import { useAvailability } from '@/features/profile/hooks/use-profile';
import { WEEKDAYS_SHORT } from '@/lib/format';
import { cn } from '@/lib/utils';

import { useOnboarding } from '../store';

import { errorMessage, StepNav } from './step-nav';

const MINUTES = [30, 45, 60, 75, 90, 120] as const;

export function StepRoutine() {
  const qc = useQueryClient();
  const existing = useAvailability().data?.items.filter((a) => a.kind === 'gym');
  const { next, back } = useOnboarding();
  // Sem nada salvo ainda, sugere seg/qua/sex.
  const [days, setDays] = useState<number[]>(
    existing && existing.length > 0 ? existing.map((a) => a.weekday) : [1, 3, 5],
  );
  const [minutes, setMinutes] = useState<number>(existing?.[0]?.maxMinutes ?? 60);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const toggle = (d: number) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  };

  const onSubmit = async (e: SyntheticEvent) => {
    e.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      await profileApi.putAvailability(
        days.map((weekday) => ({ weekday, maxMinutes: minutes, kind: 'gym' as const })),
      );
      await qc.invalidateQueries();
      next();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-5" noValidate>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          Em quais dias você pode treinar na academia?
        </legend>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS_SHORT.map((label, d) => (
            <button
              key={label}
              type="button"
              aria-pressed={days.includes(d)}
              onClick={() => {
                toggle(d);
              }}
              className={cn(
                'min-h-11 rounded-lg border border-border text-sm font-medium',
                days.includes(d) ? 'border-primary bg-primary text-primary-foreground' : 'bg-card',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {days.length === 0
            ? 'Nenhum dia: sem musculação por enquanto.'
            : `${days.length} dia(s) por semana.`}
        </p>
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="minutes">Tempo por sessão</Label>
        <Select
          id="minutes"
          value={minutes}
          onChange={(e) => {
            setMinutes(Number(e.target.value));
          }}
        >
          {MINUTES.map((m) => (
            <option key={m} value={m}>
              {m} minutos
            </option>
          ))}
        </Select>
      </div>
      <StepNav onBack={back} pending={pending} error={error} />
    </form>
  );
}
