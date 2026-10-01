'use client';

import dynamic from 'next/dynamic';

/** Placeholder com a altura aproximada do cartão (evita salto de layout). */
function CardSkeleton() {
  return <div className="h-64 animate-pulse rounded-xl bg-muted" aria-hidden />;
}

// Cartões com gráfico abaixo da dobra no Progresso: Recharts fora do JS inicial (LCP, Fase 8).
export const WeightChart = dynamic(
  () => import('@/features/body/components/weight-chart').then((m) => m.WeightChart),
  { ssr: false, loading: CardSkeleton },
);
export const ExerciseProgressCard = dynamic(
  () =>
    import('@/features/training/components/exercise-progress-card').then(
      (m) => m.ExerciseProgressCard,
    ),
  { ssr: false, loading: CardSkeleton },
);
export const LoadCard = dynamic(
  () => import('@/features/recovery/components/load-card').then((m) => m.LoadCard),
  { ssr: false, loading: CardSkeleton },
);
