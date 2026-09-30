'use client';

import { useState, type SyntheticEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { FormField } from '@/features/auth/components/form-field';
import { ApiError } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { useToday } from '@/lib/use-today';
import { isUnusualWeightChange } from '@atlas/core';

import { useCreateMeasurement, useTrend } from '../hooks/use-body';

const OPTIONAL = [
  ['waistCm', 'Cintura (cm)'],
  ['hipCm', 'Quadril (cm)'],
  ['chestCm', 'Peito (cm)'],
  ['armRCm', 'Braço (cm)'],
  ['thighRCm', 'Coxa (cm)'],
] as const;

type OptionalKey = (typeof OPTIONAL)[number][0];

export function WeighInForm() {
  const today = useToday();
  const trend = useTrend('1900-01-01', today);
  const create = useCreateMeasurement();
  const [date, setDate] = useState(today);
  const [weight, setWeight] = useState('');
  const [extras, setExtras] = useState<Partial<Record<OptionalKey, string>>>({});
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string }>();

  const submit = async () => {
    const payload = {
      date,
      ...(weight ? { weightKg: Number(weight.replace(',', '.')) } : {}),
      ...Object.fromEntries(
        Object.entries(extras)
          .filter(([, v]) => v)
          .map(([k, v]) => [k, Number(v.replace(',', '.'))]),
      ),
    };
    try {
      await create.mutateAsync(payload);
      setWeight('');
      setExtras({});
      setConfirming(false);
      setMessage({ kind: 'ok', text: 'Registrado.' });
    } catch (e) {
      setConfirming(false);
      const detail =
        e instanceof ApiError ? (e.problem.errors?.[0]?.message ?? e.problem.detail) : undefined;
      setMessage({ kind: 'error', text: detail ?? 'Não foi possível registrar.' });
    }
  };

  const onSubmit = (e: SyntheticEvent) => {
    e.preventDefault();
    setMessage(undefined);
    const latest = trend.data?.latest;
    const w = Number(weight.replace(',', '.'));
    // Aviso de plausibilidade (P3.6, ADR-018): pede confirmação, nunca bloqueia.
    if (!confirming && weight && latest && isUnusualWeightChange(latest, { date, weightKg: w })) {
      setConfirming(true);
      return;
    }
    void submit();
  };

  return (
    <Card className="space-y-4">
      <CardTitle>Registrar medidas</CardTitle>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            id="weigh-weight"
            label="Peso (kg)"
            type="number"
            step="0.1"
            inputMode="decimal"
            value={weight}
            onChange={(e) => {
              setWeight(e.target.value);
              setConfirming(false);
            }}
          />
          <FormField
            id="weigh-date"
            label="Data"
            type="date"
            max={today}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
            }}
          />
        </div>
        <details className="rounded-lg border border-border p-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">
            Mais medidas
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {OPTIONAL.map(([key, label]) => (
              <FormField
                key={key}
                id={`weigh-${key}`}
                label={label}
                type="number"
                step="0.1"
                inputMode="decimal"
                value={extras[key] ?? ''}
                onChange={(e) => {
                  setExtras((prev) => ({ ...prev, [key]: e.target.value }));
                }}
              />
            ))}
          </div>
        </details>
        {confirming && trend.data?.latest ? (
          <p role="alert" className="rounded-lg bg-muted p-3 text-sm">
            Esse peso está bem diferente da sua tendência (
            {formatNumber(trend.data.latest.trendKg, 1)} kg). Confira o valor e toque em “Confirmar”
            se estiver certo.
          </p>
        ) : null}
        {message ? (
          <p
            role="status"
            className={
              message.kind === 'error'
                ? 'text-sm text-destructive'
                : 'text-sm text-muted-foreground'
            }
          >
            {message.text}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={create.isPending}>
          {create.isPending ? 'Salvando…' : confirming ? 'Confirmar' : 'Registrar'}
        </Button>
      </form>
    </Card>
  );
}
