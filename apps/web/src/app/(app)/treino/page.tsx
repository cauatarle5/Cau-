import { PageHeader } from '@/components/empty-state';
import { TrainingHome } from '@/features/training/components/training-home';

export default function Page() {
  return (
    <>
      <PageHeader title="Treino" subtitle="Programas, sessões e progressão." />
      <TrainingHome />
    </>
  );
}
