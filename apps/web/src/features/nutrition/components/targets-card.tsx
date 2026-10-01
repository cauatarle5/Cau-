'use client';

import Link from 'next/link';

import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { EXERCISE_KIND_LABELS, LOCK_LABELS } from '@/features/profile/labels';
import { formatDate, formatNumber } from '@/lib/format';
import type { TargetsResponse } from '@atlas/schemas';

import { useTargets } from '../hooks/use-targets';

const METHOD_LABELS = {
  mifflin_st_jeor: 'Mifflin-St Jeor',
  katch_mcardle: 'Katch-McArdle',
} as const;
const CONFIDENCE_LABELS = { medium: 'média', high: 'alta' } as const;

const PROTEIN_BASIS = {
  total_weight: 'do peso',
  lean_mass: 'de massa magra',
  user_override: 'do peso (definido por você)',
} as const;

function Macro({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="rounded-lg bg-muted px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">
        {formatNumber(value)}
        <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span>
      </dd>
    </div>
  );
}

function Explanation({ data }: { data: NonNullable<TargetsResponse['breakdown']> }) {
  const pct = Math.round(data.adjustment.pct * 100);
  return (
    <details className="group rounded-lg border border-border p-3 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center font-medium">
        Como calculamos
      </summary>
      <ol className="mt-2 space-y-2 text-muted-foreground">
        <li>
          <strong className="text-foreground">Peso usado:</strong> {formatNumber(data.weightKg, 1)}{' '}
          kg (tendência em {formatDate(data.weightDate)}), {data.ageYears} anos
          {data.bodyFatPct !== null ? `, ${formatNumber(data.bodyFatPct, 1)}% de gordura` : ''}.
        </li>
        <li>
          <strong className="text-foreground">Metabolismo basal:</strong>{' '}
          {formatNumber(data.bmr.kcal)} kcal ({METHOD_LABELS[data.bmr.method]}
          {data.bmr.leanMassKg !== null
            ? `, massa magra ${formatNumber(data.bmr.leanMassKg, 1)} kg`
            : ''}
          ).
        </li>
        <li>
          <strong className="text-foreground">Estilo de vida:</strong> ×{' '}
          {formatNumber(data.tdee.lifestyleFactor, 2)} = {formatNumber(data.tdee.lifestyleKcal)}{' '}
          kcal.
        </li>
        <li>
          <strong className="text-foreground">Exercício planejado:</strong> +
          {formatNumber(data.tdee.exerciseKcalPerDay)} kcal/dia em média
          {data.exercise.items.length > 0 ? ':' : ''}
          {data.exercise.items.length > 0 ? (
            <ul className="ml-4 mt-1 list-disc" aria-label="Exercício planejado">
              {data.exercise.items.map((i) => (
                <li key={i.kind}>
                  {EXERCISE_KIND_LABELS[i.kind] ?? i.kind}: {formatNumber(i.minutesPerWeek)}{' '}
                  min/semana, MET {formatNumber(i.met, 1)} → {formatNumber(i.kcalPerWeek)}{' '}
                  kcal/semana
                </li>
              ))}
            </ul>
          ) : (
            ' (nenhum informado).'
          )}
        </li>
        {data.adaptive ? (
          <li>
            <strong className="text-foreground">Gasto total:</strong>{' '}
            {formatNumber(data.adaptive.kcal)} kcal/dia, estimativa baseada nos seus dados
            (confiança {CONFIDENCE_LABELS[data.adaptive.confidence]}). Pela fórmula seriam{' '}
            {formatNumber(data.adaptive.formulaKcal)} kcal/dia.
          </li>
        ) : (
          <li>
            <strong className="text-foreground">Gasto total estimado:</strong>{' '}
            {formatNumber(data.tdee.kcal)} kcal/dia.
          </li>
        )}
        <li>
          <strong className="text-foreground">Ajuste pelo objetivo:</strong> {pct > 0 ? '+' : ''}
          {pct}% ({data.adjustment.kcalDelta >= 0 ? '+' : ''}
          {formatNumber(data.adjustment.kcalDelta)} kcal)
          {data.adjustment.source === 'rate' ? ', pelo ritmo semanal que você definiu' : ''}.
        </li>
        {data.locksApplied.length > 0 ? (
          <li>
            <strong className="text-foreground">Travas de segurança aplicadas:</strong>{' '}
            {data.locksApplied.map((l) => LOCK_LABELS[l]).join(' ')}
          </li>
        ) : null}
        <li>
          <strong className="text-foreground">Proteína:</strong>{' '}
          {formatNumber(data.protein.gPerKg, 1)} g/kg {PROTEIN_BASIS[data.protein.basis]}. Gordura:
          0,8 g/kg (mín. 20% das kcal). Carboidrato: o restante.
        </li>
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">
        {data.adaptive
          ? 'O gasto é recalculado toda segunda-feira com sua ingestão e a tendência do peso das últimas 4 semanas, mudando no máximo 150 kcal por semana.'
          : 'Estimativa por fórmula. Quando houver 2 semanas de registros e pesagens, o gasto passa a ser ajustado pelos seus dados.'}
      </p>
    </details>
  );
}

export function TargetsView({
  data,
  explain = true,
  title = 'Média semanal',
}: {
  data: TargetsResponse;
  explain?: boolean;
  title?: string;
}) {
  if (data.blocked === 'CLINICAL_CONDITION') {
    return (
      <Card className="space-y-2" role="status">
        <CardTitle>Metas nutricionais</CardTitle>
        <CardDescription>
          Como você informou uma condição clínica (gestação, doença, transtorno alimentar ou
          medicamento), o Atlas não gera metas de calorias e macros. Procure acompanhamento de um
          nutricionista ou médico.
        </CardDescription>
      </Card>
    );
  }
  if (data.blocked || !data.targets || !data.breakdown) {
    return (
      <Card className="space-y-2">
        <CardTitle>Metas nutricionais</CardTitle>
        <CardDescription>
          Complete seu perfil para ver suas metas.{' '}
          <Link
            href="/onboarding"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Continuar configuração
          </Link>
        </CardDescription>
      </Card>
    );
  }
  const t = data.targets;
  return (
    <Card className="space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="text-xs text-muted-foreground">
            Dias de treino, esporte e descanso variam em torno desta média.
          </p>
          {data.breakdown.adaptive ? (
            <p className="text-xs font-medium text-primary">
              Estimativa baseada nos seus dados · confiança{' '}
              {CONFIDENCE_LABELS[data.breakdown.adaptive.confidence]}
            </p>
          ) : null}
        </div>
        <p className="text-3xl font-semibold tabular-nums">
          {formatNumber(t.kcal)}
          <span className="ml-1 text-sm font-normal text-muted-foreground">kcal</span>
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Macro label="Proteína" value={t.proteinG} unit="g" />
        <Macro label="Carboidrato" value={t.carbsG} unit="g" />
        <Macro label="Gordura" value={t.fatG} unit="g" />
        <Macro label="Fibra" value={t.fiberG} unit="g" />
        <Macro label="Água" value={t.waterMl} unit="ml" />
      </dl>
      {explain ? <Explanation data={data.breakdown} /> : null}
    </Card>
  );
}

export function TargetsCard({ date, explain = true }: { date: string; explain?: boolean }) {
  const q = useTargets(date);
  if (q.isPending)
    return <div className="h-40 animate-pulse rounded-xl bg-muted" aria-busy="true" />;
  if (q.isError) {
    return (
      <Card>
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar suas metas.
        </p>
      </Card>
    );
  }
  return <TargetsView data={q.data} explain={explain} />;
}
