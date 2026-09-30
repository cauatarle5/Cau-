'use client';

import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { dayTypeSchema } from '@atlas/schemas';

import { useDaySummary, useSetDayType } from '../hooks/use-nutrition';
import { DAY_TYPE_LABELS } from '../labels';

/** Tipo do dia derivado do plano, com sobrescrita (P5.8). */
export function DayTypeSelect({ date }: { date: string }) {
  const summary = useDaySummary(date);
  const set = useSetDayType();
  const current = summary.data?.targets?.dayType;
  if (!current) return null;
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="day-type" className="text-sm text-muted-foreground">
        Tipo do dia
      </Label>
      <Select
        id="day-type"
        className="w-auto"
        value={current}
        disabled={set.isPending}
        onChange={(e) => {
          set.mutate({ date, dayType: dayTypeSchema.parse(e.target.value) });
        }}
      >
        {dayTypeSchema.options.map((d) => (
          <option key={d} value={d}>
            {DAY_TYPE_LABELS[d]}
          </option>
        ))}
      </Select>
    </div>
  );
}
