'use client';

import { Minus, Plus } from 'lucide-react';

import { formatNumber } from '@/lib/format';

/** Ajuste rápido de carga/reps com botões grandes (P12.3). */
export function Stepper({
  label,
  value,
  step,
  min = 0,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number | null;
  step: number;
  min?: number;
  max: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const v = value ?? 0;
  const set = (n: number) => {
    onChange(Math.min(max, Math.max(min, Math.round(n * 100) / 100)));
  };
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`Diminuir ${label}`}
        className="flex size-11 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted"
        onClick={() => {
          set(v - step);
        }}
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <input
        aria-label={label}
        inputMode="decimal"
        className="h-11 w-16 rounded-lg border border-border bg-card text-center text-base tabular-nums"
        value={value === null ? '' : formatNumber(value, 2)}
        onChange={(e) => {
          const n = Number(e.target.value.replace(',', '.'));
          if (Number.isFinite(n)) set(n);
        }}
      />
      <button
        type="button"
        aria-label={`Aumentar ${label}`}
        className="flex size-11 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted"
        onClick={() => {
          set(v + step);
        }}
      >
        <Plus className="size-4" aria-hidden />
      </button>
      {unit ? <span className="text-xs text-muted-foreground">{unit}</span> : null}
    </div>
  );
}
