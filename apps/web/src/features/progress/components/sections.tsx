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

import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { DAY_TYPE_LABELS } from '@/features/nutrition/labels';
import { formatDate, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AnalyticsCompare, AnalyticsSummary } from '@atlas/schemas';

import { maybe, signed } from '../format';

import { BodyMap, STATUS_FILL, STATUS_LABELS } from './body-map';

type Summary = AnalyticsSummary;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-muted px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      {hint ? <dd className="text-xs text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}

const shortDate = (d: string) => formatDate(d).slice(0, 5);

// Comparação -----------------------------------------------------------------

const METRIC_LABELS: Record<
  string,
  { label: string; digits: number; unit: string; signed?: boolean }
> = {
  'training.sessionsPerWeek': { label: 'Treinos por semana', digits: 1, unit: '' },
  'training.tonnage': { label: 'Tonelagem', digits: 0, unit: ' kg' },
  'training.hardSets': { label: 'Séries duras', digits: 0, unit: '' },
  'training.adherencePct': { label: 'Aderência aos treinos', digits: 0, unit: '%' },
  'nutrition.completeDays': { label: 'Dias com registro completo', digits: 0, unit: '' },
  'nutrition.avgKcal': { label: 'kcal média', digits: 0, unit: '' },
  'nutrition.avgProteinG': { label: 'Proteína média', digits: 0, unit: ' g' },
  'nutrition.proteinAdherencePct': { label: 'Dias com proteína na meta', digits: 0, unit: '%' },
  'body.changeKg': { label: 'Variação do peso (tendência)', digits: 1, unit: ' kg', signed: true },
  'body.ratePctPerWeek': { label: 'Ritmo semanal', digits: 2, unit: '%', signed: true },
  'recovery.avgSleepHours': { label: 'Sono médio', digits: 1, unit: ' h' },
  'recovery.avgReadiness': { label: 'Prontidão média', digits: 0, unit: '' },
};

export function CompareCard({ data }: { data: AnalyticsCompare | undefined }) {
  return (
    <Card className="space-y-3" role="region" aria-label="Comparação com o período anterior">
      <div>
        <CardTitle>Comparação</CardTitle>
        <CardDescription>
          {data
            ? `${formatDate(data.b.from)} a ${formatDate(data.b.to)} × ${formatDate(data.a.from)} a ${formatDate(data.a.to)}`
            : 'Período atual × anterior'}
        </CardDescription>
      </div>
      {data ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 font-normal">Métrica</th>
                <th className="py-1 text-right font-normal">Atual</th>
                <th className="py-1 text-right font-normal">Anterior</th>
                <th className="py-1 text-right font-normal">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {data.deltas.map((d) => {
                const m = METRIC_LABELS[d.metric];
                if (!m) return null;
                return (
                  <tr key={d.metric} className="border-t border-border">
                    <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                      {m.label}
                    </th>
                    <td className="py-1.5 text-right tabular-nums">
                      {(m.signed ? signed : maybe)(d.b, m.digits, m.unit)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                      {(m.signed ? signed : maybe)(d.a, m.digits, m.unit)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {signed(d.delta, m.digits, m.unit)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-32 animate-pulse rounded-lg bg-muted" aria-busy="true" />
      )}
    </Card>
  );
}

// Corpo ---------------------------------------------------------------------------

const EXPECTED_RATE: Record<string, string> = {
  fat_loss: '−0,5% a −1,0% por semana',
  maintenance: '±0,25% por semana',
  muscle_gain: '+0,25% a +0,5% por semana',
  recomposition: 'peso estável',
  performance: 'conforme o calendário',
};

export function BodySection({ data }: { data: Summary }) {
  const b = data.summary.body;
  const goalRate = data.goal?.targetRatePctPerWeek ?? null;
  const expected =
    goalRate !== null
      ? `${signed(goalRate, 2, '%')} por semana`
      : data.goal
        ? (EXPECTED_RATE[data.goal.primaryGoal] ?? '')
        : '';
  return (
    <Card className="space-y-3" role="region" aria-label="Corpo">
      <CardTitle>Corpo</CardTitle>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Tendência atual" value={maybe(b.endTrendKg, 1, ' kg')} />
        <Stat label="Variação no período" value={signed(b.changeKg, 1, ' kg')} />
        <Stat
          label="Ritmo semanal"
          value={signed(b.ratePctPerWeek, 2, '%')}
          {...(expected ? { hint: `Alvo: ${expected}` } : {})}
        />
        <Stat label="Pesagens" value={formatNumber(b.weighIns)} />
      </dl>
    </Card>
  );
}

// Força -----------------------------------------------------------------------------

export function StrengthSection({ data }: { data: Summary }) {
  const ranked = [...data.strength].sort((a, b) => b.changePct - a.changePct);
  const stagnant = data.strength.filter((e) => e.stagnant);
  return (
    <Card className="space-y-3" role="region" aria-label="Força">
      <div>
        <CardTitle>Força</CardTitle>
        <CardDescription>e1RM estimado no período, do maior ganho para o menor.</CardDescription>
      </div>
      {ranked.length === 0 ? (
        <CardDescription>Sem treinos com carga no período.</CardDescription>
      ) : (
        <ol aria-label="Ranking de evolução" className="space-y-1 text-sm">
          {ranked.map((e) => (
            <li
              key={e.exerciseId}
              className="flex items-baseline justify-between gap-2 border-t border-border pt-1"
            >
              <span className="min-w-0 truncate">
                {e.name}
                {e.stagnant ? (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                    estagnado
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 tabular-nums">
                {formatNumber(e.firstE1rm, 1)} → {formatNumber(e.lastE1rm, 1)} kg{' '}
                <span
                  className={cn(e.changePct > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}
                >
                  ({signed(e.changePct, 1, '%')})
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {stagnant.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Estagnados: {stagnant.map((e) => e.name).join(', ')}. Tente outra faixa de repetições ou
          uma variação do exercício.
        </p>
      ) : null}
    </Card>
  );
}

// Volume ------------------------------------------------------------------------------

export function VolumeSection({ data }: { data: Summary }) {
  const rows = [...data.volume].sort((a, b) => b.hardSetsPerWeek - a.hardSetsPerWeek);
  return (
    <Card className="space-y-3" role="region" aria-label="Volume">
      <div>
        <CardTitle>Volume</CardTitle>
        <CardDescription>
          Séries duras por semana (média do período) × faixas por músculo.
        </CardDescription>
      </div>
      <BodyMap volume={data.volume} />
      <ul aria-label="Legenda" className="flex flex-wrap gap-3 text-xs">
        {(['below_mev', 'minimum', 'productive', 'high', 'above_mrv'] as const).map((s) => (
          <li key={s} className="flex items-center gap-1">
            <span
              className="inline-block size-3 rounded-sm"
              style={{ background: STATUS_FILL[s] }}
            />
            {STATUS_LABELS[s]}
          </li>
        ))}
      </ul>
      <ul aria-label="Séries por músculo" className="space-y-1 text-sm">
        {rows.map((v) => (
          <li key={v.muscle} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-2">
            <span className="truncate">{v.namePt}</span>
            <span className="h-2 rounded bg-muted">
              <span
                className="block h-2 rounded"
                style={{
                  width: `${Math.min(100, (v.hardSetsPerWeek / 22) * 100)}%`,
                  background: STATUS_FILL[v.status],
                }}
              />
            </span>
            <span className="text-right tabular-nums">{formatNumber(v.hardSetsPerWeek, 1)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// Consistência ---------------------------------------------------------------------------

export function ConsistencySection({ data }: { data: Summary }) {
  const t = data.summary.training;
  const n = data.summary.nutrition;
  const days = data.days.slice(-84);
  // Alinha o calendário na segunda-feira.
  const first = days[0]?.date;
  const pad = first ? (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7 : 0;
  return (
    <Card className="space-y-3" role="region" aria-label="Consistência">
      <CardTitle>Consistência</CardTitle>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Treinos"
          value={formatNumber(t.sessions)}
          hint={`${formatNumber(t.sessionsPerWeek, 1)} por semana`}
        />
        <Stat
          label="Aderência aos treinos"
          value={maybe(t.adherencePct, 0, '%')}
          hint={`${formatNumber(t.done)} de ${formatNumber(t.planned)} agendados`}
        />
        <Stat label="Dias com registro completo" value={formatNumber(n.completeDays)} />
        <Stat label="Dias com kcal na meta" value={maybe(n.kcalAdherencePct, 0, '%')} />
      </dl>
      <div>
        <div
          className="grid grid-cols-7 gap-1"
          role="list"
          aria-label="Calendário de treinos e registros"
        >
          {Array.from({ length: pad }, (_, i) => (
            <span key={`pad-${i}`} />
          ))}
          {days.map((d) => (
            <span
              key={d.date}
              role="listitem"
              title={`${formatDate(d.date)}${d.trained ? ', treinou' : ''}${d.completeDay ? ', registro completo' : ''}`}
              className={cn(
                'relative aspect-square rounded-sm',
                d.trained ? 'bg-primary' : 'bg-muted',
              )}
            >
              {d.completeDay ? (
                <span className="absolute bottom-0.5 right-0.5 size-1.5 rounded-full bg-emerald-500" />
              ) : null}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Quadrado azul: treino ou esporte. Ponto verde: dia com 3 ou mais refeições registradas.
        </p>
      </div>
    </Card>
  );
}

// Nutrição -----------------------------------------------------------------------------

export function NutritionSection({ data }: { data: Summary }) {
  const n = data.summary.nutrition;
  const rows = data.days
    .filter((d) => d.completeDay)
    .map((d) => ({ date: shortDate(d.date), proteina: d.proteinG, meta: d.targetProteinG }));
  return (
    <Card className="space-y-3" role="region" aria-label="Nutrição">
      <div>
        <CardTitle>Nutrição</CardTitle>
        <CardDescription>Médias dos dias com registro completo.</CardDescription>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="kcal média" value={maybe(n.avgKcal)} />
        <Stat label="Proteína média" value={maybe(n.avgProteinG, 0, ' g')} />
        <Stat label="Carboidrato médio" value={maybe(n.avgCarbsG, 0, ' g')} />
        <Stat label="Dias com proteína na meta" value={maybe(n.proteinAdherencePct, 0, '%')} />
      </dl>
      {n.byDayType.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Médias por tipo de dia">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 font-normal">Tipo do dia</th>
                <th className="py-1 text-right font-normal">Dias</th>
                <th className="py-1 text-right font-normal">kcal</th>
                <th className="py-1 text-right font-normal">Meta</th>
                <th className="py-1 text-right font-normal">P</th>
                <th className="py-1 text-right font-normal">C</th>
                <th className="py-1 text-right font-normal">G</th>
              </tr>
            </thead>
            <tbody>
              {n.byDayType.map((r) => (
                <tr key={r.dayType} className="border-t border-border tabular-nums">
                  <th scope="row" className="py-1.5 text-left font-normal">
                    {DAY_TYPE_LABELS[r.dayType]}
                  </th>
                  <td className="text-right">{r.days}</td>
                  <td className="text-right">{formatNumber(r.kcal)}</td>
                  <td className="text-right text-muted-foreground">{maybe(r.targetKcal)}</td>
                  <td className="text-right">{formatNumber(r.proteinG)}</td>
                  <td className="text-right">{formatNumber(r.carbsG)}</td>
                  <td className="text-right">{formatNumber(r.fatG)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {rows.length > 1 ? (
        <div className="h-40" role="img" aria-label="Proteína diária e meta">
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
        </div>
      ) : null}
    </Card>
  );
}

// Recuperação -----------------------------------------------------------------------------

export function RecoverySection({ data }: { data: Summary }) {
  const r = data.summary.recovery;
  const rows = data.days.map((d) => ({
    date: shortDate(d.date),
    sono: d.sleepHours,
    prontidao: d.readiness,
    acwr: d.acwr,
  }));
  return (
    <Card className="space-y-3" role="region" aria-label="Recuperação">
      <CardTitle>Recuperação</CardTitle>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Sono médio" value={maybe(r.avgSleepHours, 1, ' h')} />
        <Stat label="Prontidão média" value={maybe(r.avgReadiness)} />
        <Stat label="Carga aguda média" value={maybe(r.avgAcute7d, 0, ' UA')} />
        <Stat label="ACWR atual" value={maybe(r.lastAcwr, 2)} />
      </dl>
      {rows.length > 1 ? (
        <div className="h-44" role="img" aria-label="Prontidão e sono por dia">
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
        </div>
      ) : null}
    </Card>
  );
}
