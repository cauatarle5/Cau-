'use client';

import { EmptyState, PageHeader } from '@/components/empty-state';
import { TargetsCard } from '@/features/nutrition/components/targets-card';
import { useToday } from '@/lib/use-today';

export default function NutritionPage() {
  const today = useToday();
  return (
    <>
      <PageHeader title="Nutrição" subtitle="Registro alimentar, metas e planejamento." />
      <div className="space-y-4">
        <TargetsCard date={today} />
        <EmptyState title="Nenhuma refeição registrada">
          Em breve: registre o que você comeu digitando em texto livre, como “200g de arroz e 150g
          de frango”.
        </EmptyState>
      </div>
    </>
  );
}
