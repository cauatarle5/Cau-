'use client';

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { formatDate, formatNumber } from '@/lib/format';
import { useToday } from '@/lib/use-today';
import { addDays } from '@atlas/core';

import { useLoad } from '../hooks';

/** Carga interna: aguda (7 dias) × crônica e ACWR (P8.5). */
export function LoadCard() {
  const today = useToday();
  const load = useLoad(addDays(today, -27), today);
  const items = load.data?.items ?? [];
  const last = items.at(-1);
  const rows = items.map((i) => ({
    date: formatDate(i.date).slice(0, 5),
    aguda: i.acute7d,
    cronica: i.chronic28d,
  }));
  const acwr = last?.acwr ?? null;
  return (
    <Card className="space-y-3">
      <div className="space-y-1">
        <CardTitle>Carga de treino</CardTitle>
        <CardDescription>
          {acwr === null
            ? 'Registre treinos (com RPE) e atividades para ver sua carga.'
            : `ACWR ${formatNumber(acwr, 2)}${acwr > 1.5 ? ': pico de carga, cuidado.' : acwr < 0.8 ? ': carga abaixo do habitual.' : ': dentro do habitual.'}`}
        </CardDescription>
      </div>
      {last && last.chronic28d > 0 ? (
        <>
          <dl className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-lg bg-muted p-2">
              <dt className="text-xs text-muted-foreground">Aguda (7 d)</dt>
              <dd className="font-semibold tabular-nums">{formatNumber(last.acute7d)}</dd>
            </div>
            <div className="rounded-lg bg-muted p-2">
              <dt className="text-xs text-muted-foreground">Crônica</dt>
              <dd className="font-semibold tabular-nums">{formatNumber(last.chronic28d)}</dd>
            </div>
            <div className="rounded-lg bg-muted p-2">
              <dt className="text-xs text-muted-foreground">Monotonia</dt>
              <dd className="font-semibold tabular-nums">
                {last.monotony7d === null ? '—' : formatNumber(last.monotony7d, 1)}
              </dd>
            </div>
          </dl>
          <div className="h-40" role="img" aria-label="Gráfico de carga aguda e crônica">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ left: -16, right: 8, top: 8 }}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => `${formatNumber(Number(v))} UA`} />
                <Line
                  type="monotone"
                  dataKey="aguda"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="cronica"
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 3"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : null}
    </Card>
  );
}
