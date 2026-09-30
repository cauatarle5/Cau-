import { PageHeader } from '@/components/empty-state';
import { MeasurementList } from '@/features/body/components/measurement-list';
import { WeighInForm } from '@/features/body/components/weigh-in-form';
import { WeightChart } from '@/features/body/components/weight-chart';

export default function ProgressPage() {
  return (
    <>
      <PageHeader title="Progresso" subtitle="Como estou evoluindo?" />
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <WeightChart />
        <WeighInForm />
      </div>
      <div className="mt-4">
        <MeasurementList />
      </div>
    </>
  );
}
