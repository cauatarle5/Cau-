import type { ReactNode } from 'react';

import { Card, CardDescription, CardTitle } from '@/components/ui/card';

/** Estado vazio que ensina o próximo passo (PROMPT_MESTRE 12.7). */
export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="space-y-1">
      <CardTitle>{title}</CardTitle>
      <CardDescription>{children}</CardDescription>
    </Card>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6 space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}
