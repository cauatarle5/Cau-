'use client';

import { Card, CardDescription, CardTitle } from '@/components/ui/card';

import { useInsights } from '../hooks';

import { InsightItem } from './insight-item';

/** Insights ativos (não dispensados), do mais severo para o menos. */
export function InsightList() {
  const q = useInsights();
  const items = q.data?.items ?? [];
  return (
    <Card className="space-y-3" role="region" aria-label="Insights">
      <div>
        <CardTitle>Insights</CardTitle>
        <CardDescription>
          Gerados por regras a partir dos seus dados, uma vez por dia.
        </CardDescription>
      </div>
      {q.isPending ? (
        <div className="h-24 animate-pulse rounded-lg bg-muted" aria-busy="true" />
      ) : items.length === 0 ? (
        <CardDescription>Nenhum insight ativo.</CardDescription>
      ) : (
        <div className="space-y-2">
          {items.map((i) => (
            <InsightItem key={i.id} insight={i} />
          ))}
        </div>
      )}
    </Card>
  );
}
