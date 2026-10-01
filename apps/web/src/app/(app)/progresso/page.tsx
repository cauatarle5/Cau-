import { PageHeader } from '@/components/empty-state';
import { MeasurementList } from '@/features/body/components/measurement-list';
import { WeighInForm } from '@/features/body/components/weigh-in-form';
import { WeightChart } from '@/features/body/components/weight-chart';
import { ProgressDashboard } from '@/features/progress/components/progress-dashboard';
import { LoadCard } from '@/features/recovery/components/load-card';
import { ExerciseProgressCard } from '@/features/training/components/exercise-progress-card';
import { MuscleVolumeCard } from '@/features/training/components/muscle-volume-card';

export default function ProgressPage() {
  return (
    <>
      <PageHeader title="Progresso" subtitle="Como estou evoluindo?" />
      <ProgressDashboard />
      <div className="mt-4 grid gap-4 lg:grid-cols-[3fr_2fr]">
        <WeightChart />
        <WeighInForm />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ExerciseProgressCard />
        <MuscleVolumeCard />
        <LoadCard />
      </div>
      <div className="mt-4">
        <MeasurementList />
      </div>
    </>
  );
}
