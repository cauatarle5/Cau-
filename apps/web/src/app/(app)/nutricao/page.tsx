import { EmptyState, PageHeader } from '@/components/empty-state';

export default function Page() {
  return (
    <>
      <PageHeader title="Nutrição" subtitle="Registro alimentar, metas e planejamento." />
      <EmptyState title="Nenhuma refeição registrada">
        Registre o que você comeu digitando em texto livre, como “200g de arroz e 150g de frango”.
      </EmptyState>
    </>
  );
}
