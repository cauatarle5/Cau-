'use client';

import Link from 'next/link';

import { Card, CardDescription, CardTitle } from '@/components/ui/card';

import { useDaySummary } from '../hooks/use-nutrition';
import { DAY_TYPE_LABELS } from '../labels';

import { KcalRing, MacroBars } from './macro-bars';
import { QuickLog } from './quick-log';

/** Cartão de nutrição do Hoje (P12.2 item 3). */
export function DayNutritionCard({ date }: { date: string }) {
  const summary = useDaySummary(date);
  if (summary.isPending)
    return <div className="h-64 animate-pulse rounded-xl bg-muted" aria-busy="true" />;
  if (summary.isError) {
    return (
      <Card>
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar a nutrição do dia.
        </p>
      </Card>
    );
  }
  const s = summary.data;
  if (s.blocked === 'CLINICAL_CONDITION' || !s.targets) {
    return (
      <Card className="space-y-3">
        <CardTitle>Nutrição do dia</CardTitle>
        <CardDescription>
          {s.blocked === 'CLINICAL_CONDITION'
            ? 'Sem metas de calorias por causa da condição clínica informada. Procure acompanhamento profissional.'
            : 'Complete seu perfil para ver suas metas.'}
        </CardDescription>
        {s.blocked !== 'CLINICAL_CONDITION' ? (
          <Link href="/onboarding" className="text-sm font-medium text-primary">
            Continuar configuração
          </Link>
        ) : null}
        <QuickLog date={date} compact />
      </Card>
    );
  }
  const t = s.targets;
  return (
    <Card className="space-y-5">
      <div className="flex items-baseline justify-between gap-2">
        <CardTitle>Nutrição do dia</CardTitle>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
          {DAY_TYPE_LABELS[t.dayType]}
        </span>
      </div>
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <KcalRing consumed={s.consumed.kcal} target={t.kcal} />
        <div className="w-full flex-1">
          <MacroBars
            rows={[
              {
                label: 'Proteína',
                consumed: s.consumed.proteinG,
                planned: s.planned.proteinG,
                target: t.proteinG,
                unit: 'g',
              },
              {
                label: 'Carboidrato',
                consumed: s.consumed.carbsG,
                planned: s.planned.carbsG,
                target: t.carbsG,
                unit: 'g',
              },
              {
                label: 'Gordura',
                consumed: s.consumed.fatG,
                planned: s.planned.fatG,
                target: t.fatG,
                unit: 'g',
              },
              {
                label: 'Fibra',
                consumed: s.consumed.fiberG,
                planned: s.planned.fiberG,
                target: t.fiberG,
                unit: 'g',
              },
            ]}
          />
        </div>
      </div>
      <QuickLog date={date} compact />
    </Card>
  );
}
