'use client';

import { PageHeader } from '@/components/empty-state';
import { DayFlags, TodayInsightCard } from '@/features/insights/components/today-insight-card';
import { DayNutritionCard } from '@/features/nutrition/components/day-nutrition-card';
import { CheckinCard } from '@/features/recovery/components/checkin-card';
import { TodayWorkoutCard } from '@/features/recovery/components/today-workout-card';
import { useToday } from '@/lib/use-today';

export default function TodayPage() {
  const today = useToday();
  return (
    <>
      <PageHeader title="Hoje" subtitle="O que eu preciso fazer hoje?" />
      <DayFlags date={today} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <CheckinCard date={today} />
          <TodayWorkoutCard today={today} />
        </div>
        <div className="space-y-4">
          <DayNutritionCard date={today} />
          <TodayInsightCard date={today} />
        </div>
      </div>
    </>
  );
}
