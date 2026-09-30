'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { FormField } from '@/features/auth/components/form-field';
import { profileApi } from '@/features/profile/api';
import { profileKeys, useLimitations } from '@/features/profile/hooks/use-profile';

import { useOnboarding } from '../store';

import { errorMessage, StepNav } from './step-nav';

const SEVERITY = { 1: 'Leve', 2: 'Moderada', 3: 'Importante' } as const;

export function StepLimitations() {
  const qc = useQueryClient();
  const items = useLimitations().data?.items ?? [];
  const { next, back } = useOnboarding();
  const [region, setRegion] = useState('');
  const [severity, setSeverity] = useState(1);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: profileKeys.limitations });

  const add = async () => {
    if (!region.trim()) {
      setError('Informe a região (ex.: joelho direito)');
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      await profileApi.createLimitation({ bodyRegion: region.trim(), severity });
      setRegion('');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const onSubmit = (e: SyntheticEvent) => {
    e.preventDefault();
    next();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <p className="text-sm text-muted-foreground">
        Dores ou lesões que limitam algum movimento. Pule se não tiver nenhuma. Dor persistente
        merece avaliação de um profissional.
      </p>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
            >
              <span>
                {l.bodyRegion} · {SEVERITY[l.severity as 1 | 2 | 3]}
              </span>
              <Button
                type="button"
                variant="ghost"
                aria-label={`Remover ${l.bodyRegion}`}
                onClick={() => {
                  void profileApi.deleteLimitation(l.id).then(refresh);
                }}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <FormField
          id="bodyRegion"
          label="Região"
          placeholder="ex.: joelho direito"
          value={region}
          onChange={(e) => {
            setRegion(e.target.value);
          }}
        />
        <div className="space-y-1.5">
          <Label htmlFor="severity">Intensidade</Label>
          <Select
            id="severity"
            value={severity}
            onChange={(e) => {
              setSeverity(Number(e.target.value));
            }}
          >
            {Object.entries(SEVERITY).map(([v, label]) => (
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
        disabled={pending}
        onClick={() => void add()}
      >
        Adicionar limitação
      </Button>
      <StepNav
        onBack={back}
        pending={false}
        error={error}
        submitLabel={items.length > 0 ? 'Continuar' : 'Não tenho'}
      />
    </form>
  );
}
