'use client';

import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { formatDate, formatNumber } from '@/lib/format';

import { useDeleteMeasurement, useMeasurements } from '../hooks/use-body';

/** Tabela das medidas (também serve como visão em tabela do gráfico). */
export function MeasurementList() {
  const list = useMeasurements();
  const remove = useDeleteMeasurement();
  const items = list.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <Card className="space-y-3">
      <CardTitle>Histórico</CardTitle>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="py-1 font-medium">Data</th>
            <th className="py-1 font-medium">Peso</th>
            <th className="py-1 font-medium">Gordura</th>
            <th className="py-1 font-medium">Cintura</th>
            <th className="py-1">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {items.map((m) => (
            <tr key={m.id} className="border-t border-border">
              <td className="py-1">{formatDate(m.date)}</td>
              <td className="py-1">
                {m.weightKg !== null ? `${formatNumber(m.weightKg, 1)} kg` : '—'}
              </td>
              <td className="py-1">
                {m.bodyFatPct !== null ? `${formatNumber(m.bodyFatPct, 1)}%` : '—'}
              </td>
              <td className="py-1">
                {m.waistCm !== null ? `${formatNumber(m.waistCm, 1)} cm` : '—'}
              </td>
              <td className="py-1 text-right">
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Remover medida de ${formatDate(m.date)}`}
                  onClick={() => {
                    remove.mutate(m.id);
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
