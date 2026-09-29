import { EmptyState, PageHeader } from '@/components/empty-state';

export default function Page() {
  return (
    <>
      <PageHeader title="Hoje" subtitle="O que eu preciso fazer hoje?" />
      <EmptyState title="Seu dia aparece aqui">
        Complete seu perfil e objetivos para ver o treino, as metas nutricionais e a prontidão do
        dia.
      </EmptyState>
    </>
  );
}
