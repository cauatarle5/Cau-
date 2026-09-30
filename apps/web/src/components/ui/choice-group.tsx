'use client';

import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

interface ChoiceGroupProps<T extends string> {
  name: string;
  legend: string;
  options: readonly Option<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  error?: string | undefined;
  columns?: 1 | 2 | 3;
}

/** Grupo de rádios nativos com visual de cartão (acessível por teclado). */
export function ChoiceGroup<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  error,
  columns = 2,
}: ChoiceGroupProps<T>) {
  const errorId = `${name}-error`;
  return (
    <fieldset
      className="space-y-2"
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="text-sm font-medium">{legend}</legend>
      <div
        className={cn(
          'grid gap-2',
          columns === 1 && 'grid-cols-1',
          columns === 2 && 'grid-cols-2',
          columns === 3 && 'grid-cols-3',
        )}
      >
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex min-h-11 cursor-pointer flex-col justify-center rounded-lg border border-border bg-card px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:ring-1 has-[:checked]:ring-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => {
                onChange(o.value);
              }}
            />
            <span className="flex items-center justify-between gap-2 font-medium">
              {o.label}
              {value === o.value ? (
                <Check className="size-4 shrink-0 text-primary" aria-hidden />
              ) : null}
            </span>
            {o.hint ? <span className="text-xs text-muted-foreground">{o.hint}</span> : null}
          </label>
        ))}
      </div>
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
