'use client';

import { GlassWater } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { formatNumber } from '@/lib/format';

import { useAddWater, useDaySummary } from '../hooks/use-nutrition';

export function WaterCard({ date }: { date: string }) {
  const summary = useDaySummary(date);
  const add = useAddWater();
  const total = summary.data?.waterMl ?? 0;
  const target = summary.data?.targets?.waterMl ?? null;
  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between">
        <CardTitle className="flex items-center gap-2">
          <GlassWater className="size-5" aria-hidden /> Água
        </CardTitle>
        <p className="text-sm tabular-nums">
          <span className="text-lg font-semibold">{formatNumber(total)}</span>
          {target !== null ? (
            <span className="text-muted-foreground"> / {formatNumber(target)} ml</span>
          ) : (
            ' ml'
          )}
        </p>
      </div>
      <div className="flex gap-2">
        {[250, 500].map((ml) => (
          <Button
            key={ml}
            type="button"
            variant="outline"
            className="flex-1"
            disabled={add.isPending}
            onClick={() => {
              add.mutate({ date, ml });
            }}
          >
            +{ml} ml
          </Button>
        ))}
      </div>
    </Card>
  );
}
