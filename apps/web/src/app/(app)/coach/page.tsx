import { EmptyState, PageHeader } from '@/components/empty-state';

export default function Page() {
  return (
    <>
      <PageHeader title="Coach" subtitle="Pergunte sobre seus dados em linguagem natural." />
      <EmptyState title="Coach em breve">
        Quando houver dados registrados, o Coach responde perguntas como “Como foi minha semana?”.
      </EmptyState>
    </>
  );
}
