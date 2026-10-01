'use client';

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatNumber } from '@/lib/format';

/** Gráficos do painel de Progresso, carregados sob demanda (`next/dynamic`). */
export function ProteinChart({
  rows,
}: {
  rows: { date: string; proteina: number; meta: number | null }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={rows} margin={{ left: -16, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v) => `${formatNumber(Number(v))} g`} />
        <Bar dataKey="proteina" name="Proteína" fill="var(--color-primary)" />
        <Line
          dataKey="meta"
          name="Meta"
          stroke="var(--muted-foreground)"
          strokeDasharray="4 3"
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function RecoveryChart({
  rows,
}: {
  rows: { date: string; sono: number | null; prontidao: number | null; acwr: number | null }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ left: -16, right: 8, top: 8 }}>
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="r" domain={[0, 100]} tick={{ fontSize: 11 }} />
        <YAxis yAxisId="s" orientation="right" domain={[0, 12]} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Line
          yAxisId="r"
          dataKey="prontidao"
          name="Prontidão"
          stroke="var(--color-primary)"
          dot={false}
          connectNulls
        />
        <Line
          yAxisId="s"
          dataKey="sono"
          name="Sono (h)"
          stroke="var(--muted-foreground)"
          dot={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
