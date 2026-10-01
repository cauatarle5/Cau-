'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { InsightDto } from '@atlas/schemas';

import { useSetInsightStatus } from '../hooks';
import { SEVERITY_CLASSES, SEVERITY_LABELS } from '../labels';

/** Um insight com as ações "Entendi" (visto) e "Dispensar". */
export function InsightItem({
  insight,
  compact = false,
}: {
  insight: InsightDto;
  compact?: boolean;
}) {
  const setStatus = useSetInsightStatus();
  return (
    <article
      aria-label={insight.title}
      className={cn(
        'space-y-2 rounded-lg border border-l-4 border-border p-3',
        SEVERITY_CLASSES[insight.severity],
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-medium">{insight.title}</h3>
        <span className="shrink-0 text-xs text-muted-foreground">
          {SEVERITY_LABELS[insight.severity]}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{insight.body}</p>
      <div className={cn('flex flex-wrap gap-2', compact && 'justify-end')}>
        {insight.status === 'new' ? (
          <Button
            variant="outline"
            disabled={setStatus.isPending}
            onClick={() => {
              setStatus.mutate({ id: insight.id, status: 'seen' });
            }}
          >
            Entendi
          </Button>
        ) : null}
        <Button
          variant="ghost"
          disabled={setStatus.isPending}
          onClick={() => {
            setStatus.mutate({ id: insight.id, status: 'dismissed' });
          }}
        >
          Dispensar
        </Button>
      </div>
    </article>
  );
}
