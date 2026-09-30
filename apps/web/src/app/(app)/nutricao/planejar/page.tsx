'use client';

import { PageHeader } from '@/components/empty-state';
import { DayPlanner } from '@/features/planning/components/day-planner';
import { useToday } from '@/lib/use-today';

export default function PlanPage() {
  const today = useToday();
  return (
    <>
      <PageHeader
        title="Planejar dia"
        subtitle="Monte as refeições e veja o restante mudar na hora."
      />
      <DayPlanner today={today} />
    </>
  );
}
