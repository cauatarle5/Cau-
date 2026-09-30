'use client';

import { useState } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';

import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { formatDate, formatNumber } from '@/lib/format';
import { useToday } from '@/lib/use-today';
import { cn } from '@/lib/utils';
import { addDays } from '@atlas/core';

import { useTrend } from '../hooks/use-body';

const PERIODS = [
  { label: '4 sem', days: 28 },
  { label: '12 sem', days: 84 },
  { label: '6 meses', days: 182 },
  { label: '1 ano', days: 365 },
] as const;

interface Row {
  t: number;
  date: string;
  weightKg: number;
  trendKg: number;
}

const toTime = (date: string) => Date.parse(`${date}T12:00:00Z`);

function ChartTooltip({ active, payload }: TooltipContentProps) {
  const row = payload[0]?.payload as Row | undefined;
  if (!active || !row) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm">
      <p className="font-medium">{formatDate(row.date)}</p>
      <p>Pesagem: {formatNumber(row.weightKg, 1)} kg</p>
      <p>Tendência: {formatNumber(row.trendKg, 1)} kg</p>
    </div>
  );
}

/** Peso bruto (pontos) e tendência (linha), PROMPT_MESTRE 5.5 e 12.6. */
export function WeightChart() {
  const today = useToday();
  const [days, setDays] = useState<number>(84);
  const trend = useTrend(addDays(today, -days + 1), today);
  const rows: Row[] = (trend.data?.points ?? []).map((p) => ({ ...p, t: toTime(p.date) }));
  const latest = trend.data?.latest;

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <CardTitle>Peso</CardTitle>
          <CardDescription>
            {latest ? (
              <>
                Tendência atual{' '}
                <strong className="tabular-nums text-foreground">
                  {formatNumber(latest.trendKg, 1)} kg
                </strong>
              </>
            ) : (
              'Pesagens e tendência'
            )}
          </CardDescription>
        </div>
        <div role="group" aria-label="Período" className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              type="button"
              aria-pressed={days === p.days}
              onClick={() => {
                setDays(p.days);
              }}
              className={cn(
                'min-h-11 rounded-lg px-2 text-xs font-medium text-muted-foreground',
                days === p.days && 'bg-muted text-foreground',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {trend.isPending ? (
        <div className="h-56 animate-pulse rounded-lg bg-muted" aria-busy="true" />
      ) : rows.length < 2 ? (
        <p className="text-sm text-muted-foreground">
          Registre seu peso 3 vezes por semana para ver a tendência.
        </p>
      ) : (
        <>
          <div className="flex gap-4 text-xs text-muted-foreground" aria-hidden>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-primary/40" /> Pesagens
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-primary" /> Tendência
            </span>
          </div>
          <div className="h-56" role="img" aria-label="Gráfico de peso: pesagens e tendência">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(t: number) =>
                    formatDate(new Date(t).toISOString().slice(0, 10)).slice(0, 5)
                  }
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[
                    (min: number) => Math.floor(min - 0.5),
                    (max: number) => Math.ceil(max + 0.5),
                  ]}
                  allowDecimals={false}
                  tickFormatter={(v: number) => formatNumber(v, 0)}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip content={ChartTooltip} cursor={{ stroke: 'var(--border)' }} />
                <Scatter
                  dataKey="weightKg"
                  fill="var(--primary)"
                  fillOpacity={0.4}
                  r={4}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="trendKg"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}
