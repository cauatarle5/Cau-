import { EmptyState, PageHeader } from '@/components/empty-state';

export default function Page() {
  return (
    <>
      <PageHeader title="Progresso" subtitle="Como estou evoluindo?" />
      <EmptyState title="Sem dados para comparar">
        Registre seu peso 3 vezes por semana para ver a tendência.
      </EmptyState>
    </>
  );
}
