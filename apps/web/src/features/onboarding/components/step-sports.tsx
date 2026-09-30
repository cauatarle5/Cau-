'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { profileApi } from '@/features/profile/api';
import { useSports } from '@/features/profile/hooks/use-profile';
import { SPORT_LABELS } from '@/features/profile/labels';
import type { SportItem } from '@atlas/schemas';

import { useOnboarding } from '../store';

import { errorMessage, StepNav } from './step-nav';

const INTENSITY = { 1: 'Muito leve', 2: 'Leve', 3: 'Moderada', 4: 'Intensa', 5: 'Máxima' } as const;
const SPORTS = ['football', 'futsal', 'running', 'cycling', 'swimming', 'other'] as const;

export function StepSports() {
  const qc = useQueryClient();
  const existing = useSports().data?.items;
  const { next, back } = useOnboarding();
  const [items, setItems] = useState<SportItem[]>(
    existing?.map(({ sportCode, weeklyFrequency, typicalDurationMin, typicalIntensity }) => ({
      sportCode,
      weeklyFrequency,
      typicalDurationMin,
      typicalIntensity,
    })) ?? [],
  );
  const [draft, setDraft] = useState<SportItem>({
    sportCode: 'football',
    weeklyFrequency: 1,
    typicalDurationMin: 60,
    typicalIntensity: 3,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const onSubmit = async (e: SyntheticEvent) => {
    e.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      await profileApi.putSports(items);
      await qc.invalidateQueries();
      next();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const field = (key: keyof SportItem, value: string) => {
    setDraft((d) => ({ ...d, [key]: key === 'sportCode' ? value : Number(value) }));
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-4" noValidate>
      <p className="text-sm text-muted-foreground">
        Esportes ou cardio fixos na sua semana. Pule se não tiver.
      </p>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((s, idx) => (
            <li
              key={`${s.sportCode}-${String(idx)}`}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
            >
              <span>
                {SPORT_LABELS[s.sportCode]} · {s.weeklyFrequency}×/semana · {s.typicalDurationMin}{' '}
                min · {INTENSITY[s.typicalIntensity as 1 | 2 | 3 | 4 | 5]}
              </span>
              <Button
                type="button"
                variant="ghost"
                aria-label={`Remover ${SPORT_LABELS[s.sportCode]}`}
                onClick={() => {
                  setItems((prev) => prev.filter((_, i) => i !== idx));
                }}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="sportCode">Esporte</Label>
          <Select
            id="sportCode"
            value={draft.sportCode}
            onChange={(e) => {
              field('sportCode', e.target.value);
            }}
          >
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {SPORT_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="weeklyFrequency">Vezes por semana</Label>
          <Select
            id="weeklyFrequency"
            value={draft.weeklyFrequency}
            onChange={(e) => {
              field('weeklyFrequency', e.target.value);
            }}
          >
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="typicalDurationMin">Duração</Label>
          <Select
            id="typicalDurationMin"
            value={draft.typicalDurationMin}
            onChange={(e) => {
              field('typicalDurationMin', e.target.value);
            }}
          >
            {[30, 45, 60, 90, 120].map((n) => (
              <option key={n} value={n}>
                {n} min
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="typicalIntensity">Intensidade</Label>
          <Select
            id="typicalIntensity"
            value={draft.typicalIntensity}
            onChange={(e) => {
              field('typicalIntensity', e.target.value);
            }}
          >
            {Object.entries(INTENSITY).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => {
          setItems((prev) => [...prev, draft]);
        }}
      >
        Adicionar esporte
      </Button>
      <StepNav
        onBack={back}
        pending={pending}
        error={error}
        submitLabel={items.length > 0 ? 'Ver minhas metas' : 'Não pratico'}
      />
    </form>
  );
}
