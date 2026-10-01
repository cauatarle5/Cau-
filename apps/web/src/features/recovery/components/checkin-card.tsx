'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseDecimal } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CheckinInput } from '@atlas/schemas';

import { useCheckin, usePutCheckin } from '../hooks';
import { BAND_CLASSES, BAND_LABELS, CHECKIN_FIELDS, DRIVER_LABELS } from '../labels';

type Values = Record<(typeof CHECKIN_FIELDS)[number]['key'], number | null>;
const EMPTY: Values = {
  sleepQuality: null,
  energy: null,
  stress: null,
  fatigue: null,
  soreness: null,
};

/** Check-in em ~10 s (P12.2): 5 seletores de 1 a 5 e horas de sono; depois, a prontidão. */
export function CheckinCard({ date }: { date: string }) {
  const checkin = useCheckin(date);
  const save = usePutCheckin(date);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Values>(EMPTY);
  const [sleep, setSleep] = useState('7');
  const data = checkin.data;

  if (checkin.isPending)
    return <div className="h-32 animate-pulse rounded-xl bg-muted" aria-busy="true" />;

  if (data?.checkin && !editing) {
    const r = data.readiness;
    return (
      <Card className="space-y-2" role="region" aria-label="Prontidão">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Prontidão</CardTitle>
          <Button
            variant="ghost"
            onClick={() => {
              const c = data.checkin;
              if (c) {
                setValues({
                  sleepQuality: c.sleepQuality,
                  energy: c.energy,
                  stress: c.stress,
                  fatigue: c.fatigue,
                  soreness: c.soreness,
                });
                setSleep(c.sleepHours === null ? '' : String(c.sleepHours));
              }
              setEditing(true);
            }}
          >
            Editar
          </Button>
        </div>
        <p
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium',
            BAND_CLASSES[r.band],
          )}
        >
          <span className="text-lg font-semibold tabular-nums" data-testid="readiness-score">
            {r.score ?? '—'}
          </span>
          {BAND_LABELS[r.band]}
        </p>
        {r.drivers.length > 0 ? (
          <CardDescription>
            Fatores: {r.drivers.map((d) => DRIVER_LABELS[d]).join(', ')}.
          </CardDescription>
        ) : null}
      </Card>
    );
  }

  const complete = Object.values(values).every((v) => v !== null);
  return (
    <Card className="space-y-3" role="region" aria-label="Check-in">
      <div className="space-y-1">
        <CardTitle>Check-in de hoje</CardTitle>
        <CardDescription>Leva 10 segundos e ajusta o treino do dia.</CardDescription>
      </div>
      {CHECKIN_FIELDS.map((f) => (
        <div key={f.key} className="space-y-1">
          <p className="text-sm font-medium">{f.label}</p>
          <div className="flex items-center gap-1.5" role="group" aria-label={f.label}>
            <span className="w-14 text-xs text-muted-foreground">{f.low}</span>
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={values[f.key] === v}
                className={cn(
                  'size-10 rounded-md border border-border text-sm',
                  values[f.key] === v && 'border-primary bg-primary text-primary-foreground',
                )}
                onClick={() => {
                  setValues((prev) => ({ ...prev, [f.key]: v }));
                }}
              >
                {v}
              </button>
            ))}
            <span className="w-14 text-right text-xs text-muted-foreground">{f.high}</span>
          </div>
        </div>
      ))}
      <div className="flex items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="sleep-hours">Horas de sono</Label>
          <Input
            id="sleep-hours"
            inputMode="decimal"
            className="w-24"
            value={sleep}
            onChange={(e) => {
              setSleep(e.target.value);
            }}
          />
        </div>
        <Button
          disabled={!complete || save.isPending}
          onClick={() => {
            const v = values;
            if (
              v.sleepQuality === null ||
              v.energy === null ||
              v.stress === null ||
              v.fatigue === null ||
              v.soreness === null
            )
              return;
            const body: CheckinInput = {
              sleepHours: parseDecimal(sleep),
              sleepQuality: v.sleepQuality,
              energy: v.energy,
              stress: v.stress,
              fatigue: v.fatigue,
              soreness: v.soreness,
            };
            save.mutate(body, {
              onSuccess: () => {
                setEditing(false);
              },
            });
          }}
        >
          Salvar check-in
        </Button>
      </div>
      {save.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível salvar. Confira os valores.
        </p>
      ) : null}
    </Card>
  );
}
