'use client';

import Link from 'next/link';

import { PageHeader } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
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
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <DayTypeSelect date={today} />
        <Button asChild variant="outline">
          <Link href="/nutricao/planejar">Planejar dia</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/nutricao/receitas">Receitas</Link>
        </Button>
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
