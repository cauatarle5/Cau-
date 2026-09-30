'use client';

import { PageHeader } from '@/components/empty-state';
import { DayNutritionCard } from '@/features/nutrition/components/day-nutrition-card';
import { useToday } from '@/lib/use-today';

export default function TodayPage() {
  const today = useToday();
  return (
    <>
      <PageHeader title="Hoje" subtitle="O que eu preciso fazer hoje?" />
      <div className="grid gap-4 lg:grid-cols-2">
        <DayNutritionCard date={today} />
      </div>
    </>
  );
}
