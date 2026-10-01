'use client';

import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/format';

import { useWeeklySummary } from '../hooks';

import { RichText } from './rich-text';

/** Resumo semanal (P10.5) no Progresso. */
export function WeeklySummaryCard() {
  const q = useWeeklySummary();
  const s = q.data?.summary ?? null;
  return (
    <Card className="space-y-2" role="region" aria-label="Resumo da semana">
      <CardTitle>Resumo da semana</CardTitle>
      {q.isPending ? (
        <div className="h-16 animate-pulse rounded-lg bg-muted" aria-busy="true" />
      ) : s ? (
        <>
          <CardDescription>
            Semana de {formatDate(s.weekStart)}
            {s.source === 'ai' ? ' · redigido pelo Coach com os números do Atlas' : ''}
          </CardDescription>
          <div className="space-y-2 text-sm">
            <RichText text={s.text} />
          </div>
        </>
      ) : (
        <CardDescription>O primeiro resumo sai na segunda-feira de manhã.</CardDescription>
      )}
    </Card>
  );
}
