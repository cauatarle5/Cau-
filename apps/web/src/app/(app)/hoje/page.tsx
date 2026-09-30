'use client';

import { PageHeader } from '@/components/empty-state';
import { TargetsCard } from '@/features/nutrition/components/targets-card';
import { useToday } from '@/lib/use-today';

export default function TodayPage() {
  const today = useToday();
  return (
    <>
      <PageHeader title="Hoje" subtitle="O que eu preciso fazer hoje?" />
      <TargetsCard date={today} explain={false} />
    </>
  );
}
