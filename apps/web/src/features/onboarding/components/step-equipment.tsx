'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Button } from '@/components/ui/button';
import { profileApi } from '@/features/profile/api';
import { useEquipment } from '@/features/profile/hooks/use-profile';

import { useOnboarding } from '../store';

import { errorMessage, StepNav } from './step-nav';

export function StepEquipment() {
  const qc = useQueryClient();
  const data = useEquipment().data;
  const { next, back } = useOnboarding();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(data?.items.map((i) => i.equipmentCode)),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const catalog = data?.catalog ?? [];

  const onSubmit = async (e: SyntheticEvent) => {
    e.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      await profileApi.putEquipment(
        [...selected].map((equipmentCode) => ({ equipmentCode, location: 'gym' as const })),
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
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-4" noValidate>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">O que você tem disponível?</p>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setSelected(new Set(catalog.map((c) => c.code)));
          }}
        >
          Academia completa
        </Button>
      </div>
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="sr-only">Equipamentos</legend>
        {catalog.map((c) => (
          <label
            key={c.code}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm has-[:checked]:border-primary"
          >
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={selected.has(c.code)}
              onChange={() => {
                setSelected((prev) => {
                  const nextSet = new Set(prev);
                  if (nextSet.has(c.code)) nextSet.delete(c.code);
                  else nextSet.add(c.code);
                  return nextSet;
                });
              }}
            />
            {c.namePt}
          </label>
        ))}
      </fieldset>
      <StepNav onBack={back} pending={pending} error={error} />
    </form>
  );
}
