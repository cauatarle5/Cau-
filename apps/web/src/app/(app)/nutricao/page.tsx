'use client';

import { PageHeader } from '@/components/empty-state';
import { DayNutritionCard } from '@/features/nutrition/components/day-nutrition-card';
import { DayTypeSelect } from '@/features/nutrition/components/day-type-select';
import { FoodSearchAdd } from '@/features/nutrition/components/food-search-add';
import { MealsOfDay } from '@/features/nutrition/components/meals-of-day';
import { TargetsCard } from '@/features/nutrition/components/targets-card';
import { WaterCard } from '@/features/nutrition/components/water-card';
import { useToday } from '@/lib/use-today';

export default function NutritionPage() {
  const today = useToday();
  return (
    <>
      <PageHeader title="Nutrição" subtitle="Registro alimentar, metas e planejamento." />
      <div className="mb-4">
        <DayTypeSelect date={today} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          <DayNutritionCard date={today} />
          <MealsOfDay date={today} />
        </div>
        <div className="space-y-4">
          <WaterCard date={today} />
          <FoodSearchAdd date={today} />
          <TargetsCard date={today} />
        </div>
      </div>
    </>
  );
}
