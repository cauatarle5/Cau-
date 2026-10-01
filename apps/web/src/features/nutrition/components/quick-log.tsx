'use client';

import { Trash2 } from 'lucide-react';
import { useState, type SyntheticEvent, useId } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ApiError } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { suggestSlot, type FoodUnit } from '@atlas/core';
import { mealSlotSchema, type MealSlot } from '@atlas/schemas';

import { useMealReview, type ReviewedItem } from '../hooks/use-meal-review';
import { useCreateMeal, useParseMeal } from '../hooks/use-nutrition';
import { SLOT_LABELS, UNIT_LABELS } from '../labels';

import { CustomFoodForm } from './custom-food-form';

const UNITS: FoodUnit[] = [
  'g',
  'ml',
  'unit',
  'slice',
  'tbsp',
  'tsp',
  'cup',
  'ladle',
  'scoop',
  'glass',
  'portion',
  'small',
  'medium',
  'large',
];

const CONFIDENCE = {
  auto: { label: 'Confirmado', className: 'text-muted-foreground' },
  review: { label: 'Confira', className: 'text-foreground' },
  choose: { label: 'Escolha o alimento', className: 'text-destructive' },
} as const;

function ReviewRow({
  item,
  onChange,
  onRemove,
  onCreateFood,
}: {
  item: ReviewedItem;
  onChange: (patch: Partial<ReviewedItem>) => void;
  onRemove: () => void;
  onCreateFood: () => void;
}) {
  const conf = item.food
    ? CONFIDENCE[item.confidence === 'choose' ? 'review' : item.confidence]
    : CONFIDENCE.choose;
  return (
    <li className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <p className={cn('text-xs font-medium', conf.className)}>
            “{item.query}” · {item.food ? conf.label : 'Não encontrado'}
          </p>
          {item.options.length > 0 ? (
            <Select
              aria-label={`Alimento para ${item.query}`}
              value={item.food?.id ?? ''}
              onChange={(e) => {
                onChange({
                  food: item.options.find((o) => o.id === e.target.value) ?? null,
                  gramsOverride: null,
                });
              }}
            >
              {!item.food ? <option value="">Escolha…</option> : null}
              {item.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.namePt}
                </option>
              ))}
            </Select>
          ) : null}
          {!item.food ? (
            <Button
              type="button"
              variant="ghost"
              className="px-0 text-primary"
              onClick={onCreateFood}
            >
              Cadastrar rápido
            </Button>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          aria-label={`Remover ${item.query}`}
          onClick={onRemove}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
      {item.food ? (
        <div className="grid grid-cols-[5rem_1fr_auto] items-center gap-2">
          <Input
            aria-label={`Quantidade de ${item.query}`}
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={item.quantity}
            onChange={(e) => {
              onChange({ quantity: Number(e.target.value), gramsOverride: null });
            }}
          />
          <Select
            aria-label={`Unidade de ${item.query}`}
            value={item.unit ?? 'unit'}
            onChange={(e) => {
              onChange({ unit: e.target.value as FoodUnit, gramsOverride: null });
            }}
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABELS[u]}
              </option>
            ))}
          </Select>
          <span className="w-20 text-right text-sm tabular-nums">
            {item.nutrients ? `${formatNumber(item.nutrients.kcal ?? 0)} kcal` : '—'}
          </span>
        </div>
      ) : null}
      {item.needsGrams ? (
        <div className="flex items-center gap-2 text-sm">
          <Label htmlFor={`grams-${item.key}`} className="text-muted-foreground">
            Quantos gramas tem essa medida?
          </Label>
          <Input
            id={`grams-${item.key}`}
            type="number"
            inputMode="decimal"
            className="w-24"
            onChange={(e) => {
              onChange({ gramsOverride: Number(e.target.value) * 1 || null });
            }}
          />
        </div>
      ) : item.grams !== null ? (
        <p className="text-xs text-muted-foreground tabular-nums">{formatNumber(item.grams)} g</p>
      ) : null}
    </li>
  );
}

/** "O que você comeu?": texto → itens editáveis → um toque para confirmar (P6.2, P12.4). */
export function QuickLog({ date, compact = false }: { date: string; compact?: boolean }) {
  const uid = useId();
  const [text, setText] = useState('');
  const [slot, setSlot] = useState<MealSlot>(() => suggestSlot(new Date().getHours()));
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string }>();
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const parse = useParseMeal();
  const create = useCreateMeal();
  const review = useMealReview();

  const onParse = async (e: SyntheticEvent) => {
    e.preventDefault();
    setMessage(undefined);
    if (!text.trim()) return;
    try {
      review.load(await parse.mutateAsync(text));
    } catch (err) {
      setMessage({
        kind: 'error',
        text:
          err instanceof ApiError
            ? (err.problem.detail ?? err.problem.title)
            : 'Não foi possível interpretar.',
      });
    }
  };

  const onConfirm = async () => {
    try {
      await create.mutateAsync({
        date,
        slot,
        sourceText: text,
        items: review.items.flatMap((i) =>
          i.food
            ? [
                {
                  foodId: i.food.id,
                  quantity: i.quantity,
                  unit: i.unit,
                  grams: i.gramsOverride,
                  query: i.query,
                  suggestedFoodId: i.suggestedFoodId,
                  parseConfidence: i.score !== null ? Math.min(1, i.score) : null,
                },
              ]
            : [],
        ),
      });
      setMessage({ kind: 'ok', text: `Registrado em ${SLOT_LABELS[slot]}.` });
      setText('');
      review.clear();
    } catch (err) {
      setMessage({
        kind: 'error',
        text:
          err instanceof ApiError
            ? (err.problem.detail ?? err.problem.title)
            : 'Não foi possível registrar.',
      });
    }
  };

  return (
    <div className="space-y-3">
      <form onSubmit={(e) => void onParse(e)} className="space-y-2">
        <Label htmlFor={`${uid}-text`}>O que você comeu?</Label>
        <div className="flex gap-2">
          <Input
            id={`${uid}-text`}
            placeholder="ex.: 200g de arroz, 150g de frango e 100g de feijão"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
            }}
          />
          <Button type="submit" disabled={parse.isPending || !text.trim()}>
            {parse.isPending ? '…' : 'Ok'}
          </Button>
        </div>
      </form>

      {review.items.length > 0 ? (
        <div className="space-y-3">
          <ul className="space-y-2" aria-label="Itens interpretados">
            {review.items.map((item) => (
              <ReviewRow
                key={item.key}
                item={item}
                onChange={(patch) => {
                  review.update(item.key, patch);
                }}
                onRemove={() => {
                  review.remove(item.key);
                }}
                onCreateFood={() => {
                  setCreatingFor(item.key);
                }}
              />
            ))}
          </ul>
          {creatingFor ? (
            <CustomFoodForm
              initialName={review.items.find((i) => i.key === creatingFor)?.query ?? ''}
              onCancel={() => {
                setCreatingFor(null);
              }}
              onCreated={(food) => {
                review.update(creatingFor, {
                  food,
                  options: [food],
                  confidence: 'auto',
                  unit: 'g',
                  quantity: 100,
                });
                setCreatingFor(null);
              }}
            />
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm tabular-nums">
            <span className="font-semibold">{formatNumber(review.totals.kcal ?? 0)} kcal</span>
            <span>P {formatNumber(review.totals.proteinG ?? 0, 1)} g</span>
            <span>C {formatNumber(review.totals.carbsG ?? 0, 1)} g</span>
            <span>G {formatNumber(review.totals.fatG ?? 0, 1)} g</span>
          </div>
          <div
            className={cn('grid gap-2', compact ? 'grid-cols-[1fr_auto]' : 'grid-cols-[1fr_auto]')}
          >
            <Select
              aria-label="Refeição"
              value={slot}
              onChange={(e) => {
                setSlot(mealSlotSchema.parse(e.target.value));
              }}
            >
              {mealSlotSchema.options.map((s) => (
                <option key={s} value={s}>
                  {SLOT_LABELS[s]}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              onClick={() => void onConfirm()}
              disabled={!review.ready || create.isPending}
            >
              {create.isPending ? 'Salvando…' : 'Confirmar'}
            </Button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p
          role="status"
          className={
            message.kind === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'
          }
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
