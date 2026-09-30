'use client';

import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/format';

import { planningApi } from '../api';
import { usePlanMutation } from '../hooks';
import { NUTRIENT_LABELS } from '../labels';

/** Trocas sugeridas pelo motor de substituição (P7.3); aplicar troca alimento e gramas. */
export function SubstitutionList({
  itemId,
  nutrient,
  onDone,
}: {
  itemId: string;
  nutrient: 'kcal' | 'fatG' | 'carbsG';
  onDone: () => void;
}) {
  const subs = useQuery({
    queryKey: ['planning', 'substitutions', itemId, nutrient],
    queryFn: () => planningApi.substitutions(itemId, nutrient),
  });
  const apply = usePlanMutation((o: { foodId: string; grams: number }) =>
    planningApi.updateItem(itemId, { foodId: o.foodId, quantity: o.grams, unit: 'g' }),
  );
  const unit = nutrient === 'kcal' ? 'kcal' : 'g';
  if (subs.isPending) return <p className="text-sm text-muted-foreground">Buscando trocas…</p>;
  const items = subs.data?.items ?? [];
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nenhuma troca parecida reduz esse excesso.</p>
    );
  }
  return (
    <ul className="space-y-2" aria-label="Trocas sugeridas">
      {items.map((o) => (
        <li
          key={o.food.id}
          className="flex items-center justify-between gap-2 rounded-lg bg-muted p-2 text-sm"
        >
          <span>
            {formatNumber(o.grams)} g de <strong>{o.food.namePt}</strong>
            <span className="block text-xs text-muted-foreground">
              −{formatNumber(o.reduction, 1)} {unit} de {NUTRIENT_LABELS[nutrient]} ·{' '}
              {formatNumber(o.nutrients.kcal ?? 0)} kcal ·{' '}
              {formatNumber(o.nutrients.proteinG ?? 0, 1)} g de proteína
            </span>
          </span>
          <Button
            variant="outline"
            disabled={apply.isPending}
            onClick={() => {
              void apply.mutateAsync({ foodId: o.food.id, grams: o.grams }).then(onDone);
            }}
          >
            Trocar
          </Button>
        </li>
      ))}
    </ul>
  );
}
