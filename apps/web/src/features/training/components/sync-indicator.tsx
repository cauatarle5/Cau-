'use client';

import { Cloud, CloudOff, RefreshCw } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useSyncStore } from '@/offline/queue';

/** Estado da fila offline (ADR-034). */
export function SyncIndicator({ className }: { className?: string }) {
  const { pending, syncing, online, lastError } = useSyncStore();
  const Icon = !online ? CloudOff : syncing ? RefreshCw : Cloud;
  const text = !online
    ? pending > 0
      ? `Sem conexão · ${String(pending)} ${pending === 1 ? 'registro pendente' : 'registros pendentes'}`
      : 'Sem conexão · registros ficam salvos no aparelho'
    : pending > 0
      ? `Sincronizando ${String(pending)}…`
      : 'Tudo sincronizado';
  return (
    <div className={cn('space-y-1', className)}>
      <p
        role="status"
        data-testid="sync-status"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
          online ? 'bg-muted text-muted-foreground' : 'bg-amber-100 text-amber-900',
        )}
      >
        <Icon className={cn('size-3.5', syncing && 'animate-spin')} aria-hidden />
        {text}
      </p>
      {lastError ? (
        <p className="text-xs text-destructive">Um registro foi recusado: {lastError}</p>
      ) : null}
    </div>
  );
}
