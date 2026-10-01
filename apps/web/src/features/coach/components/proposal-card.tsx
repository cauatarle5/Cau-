'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import type { ProposalDto } from '@atlas/schemas';

import { useResolveProposal } from '../hooks';

const STATUS_LABELS: Record<ProposalDto['status'], string> = {
  pending: 'Aguardando sua confirmação',
  accepted: 'Aplicado',
  rejected: 'Descartado',
  expired: 'Expirado',
};

/** Proposta de escrita do Coach com "Aplicar" e "Descartar" (P10.2). */
export function ProposalCard({
  proposal,
  onResolved,
}: {
  proposal: ProposalDto;
  onResolved?: (p: ProposalDto) => void;
}) {
  const resolve = useResolveProposal();
  const pending = proposal.status === 'pending';
  const act = (action: 'accept' | 'reject') => {
    resolve.mutate({ id: proposal.id, action }, { onSuccess: (p) => onResolved?.(p) });
  };
  return (
    <article
      aria-label={`Proposta: ${proposal.summary}`}
      className="space-y-2 rounded-lg border border-primary/40 bg-card p-3 text-sm"
    >
      <p className="font-medium">{proposal.summary}</p>
      {proposal.details.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
          {proposal.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      ) : null}
      {pending ? (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={resolve.isPending}
            onClick={() => {
              act('accept');
            }}
          >
            Aplicar
          </Button>
          <Button
            variant="outline"
            disabled={resolve.isPending}
            onClick={() => {
              act('reject');
            }}
          >
            Descartar
          </Button>
        </div>
      ) : (
        <p role="status" className="text-xs text-muted-foreground">
          {STATUS_LABELS[proposal.status]}
          {proposal.status === 'accepted' && proposal.link ? (
            <>
              {' · '}
              <Link
                href={proposal.link}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Ver
              </Link>
            </>
          ) : null}
        </p>
      )}
      {resolve.isError ? (
        <p role="alert" className="text-xs text-destructive">
          {resolve.error instanceof ApiError ? resolve.error.message : 'Não foi possível aplicar.'}
        </p>
      ) : null}
    </article>
  );
}
