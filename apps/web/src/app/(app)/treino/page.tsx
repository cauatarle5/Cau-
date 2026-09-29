import { EmptyState, PageHeader } from '@/components/empty-state';

export default function Page() {
  return (
    <>
      <PageHeader title="Treino" subtitle="Programas, sessões e progressão." />
      <EmptyState title="Nenhum programa ainda">
        Crie seu primeiro programa para registrar séries com um toque.
      </EmptyState>
    </>
  );
}
