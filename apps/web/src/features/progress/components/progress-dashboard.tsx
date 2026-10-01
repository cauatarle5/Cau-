'use client';

import { useState } from 'react';

import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InsightList } from '@/features/insights/components/insight-list';
import { useCompare, useSummary } from '@/features/insights/hooks';
import { useToday } from '@/lib/use-today';
import { cn } from '@/lib/utils';
import { addDays } from '@atlas/core';

import { PRESETS, periods, type Preset } from '../period';

import {
  BodySection,
  CompareCard,
  ConsistencySection,
  NutritionSection,
  RecoverySection,
  StrengthSection,
  VolumeSection,
} from './sections';

/** Progresso do período (P12.6) com comparação com o período anterior. */
export function ProgressDashboard() {
  const today = useToday();
  const [preset, setPreset] = useState<Preset>('12w');
  const [custom, setCustom] = useState({ from: addDays(today, -29), to: today });
  const { current, previous } = periods(preset, today, custom);
  const valid = current.from <= current.to && current.to <= today;
  const summary = useSummary(current.from, current.to, valid);
  const compare = useCompare(previous, current, valid);
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div role="group" aria-label="Período" className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={preset === p.value}
              onClick={() => {
                setPreset(p.value);
              }}
              className={cn(
                'min-h-11 rounded-lg border px-3 text-sm',
                preset === p.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card hover:bg-muted',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' ? (
          <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
            <div className="space-y-1">
              <Label htmlFor="period-from">De</Label>
              <Input
                id="period-from"
                type="date"
                value={custom.from}
                max={today}
                onChange={(e) => {
                  setCustom((c) => ({ ...c, from: e.target.value }));
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="period-to">Até</Label>
              <Input
                id="period-to"
                type="date"
                value={custom.to}
                max={today}
                onChange={(e) => {
                  setCustom((c) => ({ ...c, to: e.target.value }));
                }}
              />
            </div>
            {!valid ? (
              <p role="alert" className="col-span-2 text-sm text-destructive">
                Escolha um início anterior ao fim, sem datas futuras.
              </p>
            ) : null}
          </div>
        ) : null}
      </Card>

      {summary.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar o período.
        </p>
      ) : !summary.data ? (
        <div className="h-48 animate-pulse rounded-xl bg-muted" aria-busy="true" />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <BodySection data={summary.data} />
            <CompareCard data={compare.data} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <StrengthSection data={summary.data} />
            <VolumeSection data={summary.data} />
          </div>
          <ConsistencySection data={summary.data} />
          <div className="grid gap-4 lg:grid-cols-2">
            <NutritionSection data={summary.data} />
            <RecoverySection data={summary.data} />
          </div>
        </>
      )}
      <InsightList />
    </div>
  );
}
