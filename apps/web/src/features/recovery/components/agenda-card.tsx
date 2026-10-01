'use client';

import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { formatDate, WEEKDAYS_SHORT } from '@/lib/format';
import { addDays } from '@atlas/core';

import { usePatchPlanned, usePlanned } from '../hooks';

const STATUS: Record<string, string> = {
  planned: '',
  moved: 'movido',
  skipped: 'pulado',
  done: 'feito',
  adapted: 'feito (adaptado)',
};

/** Agenda dos próximos 7 dias (ADR-043): mover para hoje ou pular. */
export function AgendaCard({ today }: { today: string }) {
  const planned = usePlanned(today, addDays(today, 6));
  const patch = usePatchPlanned();
  const items = planned.data?.items ?? [];
  if (planned.isSuccess && items.length === 0) return null;
  return (
    <Card className="space-y-2" role="region" aria-label="Agenda da semana">
      <CardTitle>Agenda da semana</CardTitle>
      <ul className="divide-y divide-border" aria-label="Treinos agendados">
        {items.map((p) => {
          const dow = WEEKDAYS_SHORT[new Date(`${p.date}T12:00:00Z`).getUTCDay()] ?? '';
          const open = p.status === 'planned' || p.status === 'moved';
          return (
            <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div>
                <p className="font-medium">
                  {p.templateName}
                  {p.deload ? ' · deload' : ''}
                </p>
                <CardDescription>
                  {dow} {formatDate(p.date).slice(0, 5)} · RIR {p.rir}
                  {STATUS[p.status] ? ` · ${STATUS[p.status] ?? ''}` : ''}
                </CardDescription>
              </div>
              {open ? (
                <div className="flex gap-1">
                  {p.date !== today ? (
                    <Button
                      variant="outline"
                      className="px-3 text-xs"
                      disabled={patch.isPending}
                      aria-label={`Mover ${p.templateName} para hoje`}
                      onClick={() => {
                        patch.mutate({ id: p.id, date: today });
                      }}
                    >
                      Hoje
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    className="px-3 text-xs"
                    disabled={patch.isPending}
                    aria-label={`Pular ${p.templateName}`}
                    onClick={() => {
                      patch.mutate({ id: p.id, status: 'skipped' });
                    }}
                  >
                    Pular
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
