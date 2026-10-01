'use client';

import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { DAY_TYPE_LABELS } from '@/features/nutrition/labels';

import { useDailyContext } from '../hooks';
import { FLAG_LABELS } from '../labels';

import { InsightItem } from './insight-item';

/** Sinais do dia (P9) no topo da tela Hoje. */
export function DayFlags({ date }: { date: string }) {
  const q = useDailyContext(date);
  const ctx = q.data;
  if (!ctx || (ctx.flags.length === 0 && !ctx.dayType)) return null;
  return (
    <ul aria-label="Sinais do dia" className="mb-4 flex flex-wrap gap-2 text-xs">
      {ctx.dayType ? (
        <li className="rounded-full bg-muted px-3 py-1 font-medium">
          {DAY_TYPE_LABELS[ctx.dayType]}
        </li>
      ) : null}
      {ctx.flags.map((f) => (
        <li
          key={f}
          className="rounded-full bg-amber-100 px-3 py-1 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
        >
          {FLAG_LABELS[f]}
        </li>
      ))}
    </ul>
  );
}

/** O insight mais severo ainda não visto (P12.2, item 5). */
export function TodayInsightCard({ date }: { date: string }) {
  const q = useDailyContext(date);
  const insight = q.data?.topInsight ?? null;
  return (
    <Card className="space-y-3" role="region" aria-label="Insight do dia">
      <CardTitle>Insight do dia</CardTitle>
      {q.isPending ? (
        <div className="h-16 animate-pulse rounded-lg bg-muted" aria-busy="true" />
      ) : insight ? (
        <InsightItem insight={insight} compact />
      ) : (
        <CardDescription>Nada novo por aqui. Continue registrando.</CardDescription>
      )}
    </Card>
  );
}
