import { PageHeader } from '@/components/empty-state';
import { RecipesPage } from '@/features/recipes/components/recipes-page';

export default function Page() {
  return (
    <>
      <PageHeader title="Receitas" subtitle="Total, porção e 100 g calculados dos ingredientes." />
      <RecipesPage />
    </>
  );
}
