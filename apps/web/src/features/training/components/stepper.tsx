'use client';

import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';

import { formatInputNumber, parseDecimal } from '@/lib/format';

const display = (v: number | null) => (v === null ? '' : formatInputNumber(v));

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
  // Rascunho enquanto digita: "22," fica na tela até virar "22,5".
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n * 100) / 100));
  const bump = (delta: number) => {
    setDraft(null);
    onChange(clamp((value ?? 0) + delta));
  };
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`Diminuir ${label}`}
        className="flex size-11 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted"
        onClick={() => {
          bump(-step);
        }}
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <input
        aria-label={label}
        inputMode="decimal"
        className="h-11 w-16 rounded-lg border border-border bg-card text-center text-base tabular-nums"
        value={draft ?? display(value)}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = parseDecimal(e.target.value);
          if (n !== null) onChange(clamp(n));
        }}
        onBlur={() => {
          setDraft(null);
        }}
      />
      <button
        type="button"
        aria-label={`Aumentar ${label}`}
        className="flex size-11 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted"
        onClick={() => {
          bump(step);
        }}
      >
        <Plus className="size-4" aria-hidden />
      </button>
      {unit ? <span className="text-xs text-muted-foreground">{unit}</span> : null}
    </div>
  );
}
