'use client';

import { PageHeader } from '@/components/empty-state';
import { DayNutritionCard } from '@/features/nutrition/components/day-nutrition-card';
import { CheckinCard } from '@/features/recovery/components/checkin-card';
import { TodayWorkoutCard } from '@/features/recovery/components/today-workout-card';
import { useToday } from '@/lib/use-today';

export default function TodayPage() {
  const today = useToday();
  return (
    <>
      <PageHeader title="Hoje" subtitle="O que eu preciso fazer hoje?" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <CheckinCard date={today} />
          <TodayWorkoutCard today={today} />
        </div>
        <DayNutritionCard date={today} />
      </div>
    </>
  );
}
