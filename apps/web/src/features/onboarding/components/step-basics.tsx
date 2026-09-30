'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { ChoiceGroup } from '@/components/ui/choice-group';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { FormField } from '@/features/auth/components/form-field';
import { bodyApi } from '@/features/body/api';
import { profileApi } from '@/features/profile/api';
import { useProfile } from '@/features/profile/hooks/use-profile';
import {
  BODY_FAT_METHOD_LABELS,
  EXPERIENCE_LABELS,
  LIFESTYLE_HINTS,
  LIFESTYLE_LABELS,
} from '@/features/profile/labels';
import { useToday } from '@/lib/use-today';
import { bodyFatMethodSchema, profileInputSchema, ranges } from '@atlas/schemas';

import { useOnboarding } from '../store';

import { errorMessage, StepNav } from './step-nav';

/** Campo numérico opcional: vazio → undefined. */
const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined || Number.isNaN(v) ? undefined : Number(v)),
    schema.optional(),
  );

const schema = profileInputSchema
  .pick({
    sex: true,
    birthDate: true,
    trainingExperience: true,
    activityLifestyle: true,
    clinicalCondition: true,
  })
  .extend({
    heightCm: z.coerce.number<string | number>().pipe(ranges.heightCm()),
    weightKg: z.coerce.number<string | number>().pipe(ranges.weightKg()),
    bodyFatPct: optionalNumber(ranges.bodyFatPct()),
    bodyFatMethod: bodyFatMethodSchema.optional().or(z.literal('').transform(() => undefined)),
    conditioningLevel: z.coerce.number<string | number>().int().min(1).max(5),
  })
  .refine((v) => v.bodyFatPct === undefined || !!v.bodyFatMethod, {
    message: 'Informe como a gordura foi medida',
    path: ['bodyFatMethod'],
  });

type FormIn = z.input<typeof schema>;
type FormOut = z.output<typeof schema>;

export function StepBasics({ initialWeightKg }: { initialWeightKg: number | undefined }) {
  const qc = useQueryClient();
  const today = useToday();
  const profile = useProfile().data?.profile;
  const { next, weighInId, setWeighInId } = useOnboarding();
  const [error, setError] = useState<string>();

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(schema),
    defaultValues: {
      sex: profile?.sex,
      birthDate: profile?.birthDate ?? '',
      heightCm: profile?.heightCm ?? '',
      weightKg: initialWeightKg ?? '',
      trainingExperience: profile?.trainingExperience ?? 'beginner',
      activityLifestyle: profile?.activityLifestyle ?? 'light',
      conditioningLevel: profile?.conditioningLevel ?? 3,
      clinicalCondition: profile?.clinicalCondition ?? false,
      bodyFatMethod: '',
    },
  });

  const onSubmit = handleSubmit(async (v) => {
    setError(undefined);
    try {
      await profileApi.put({
        sex: v.sex,
        birthDate: v.birthDate,
        heightCm: v.heightCm,
        trainingExperience: v.trainingExperience,
        conditioningLevel: v.conditioningLevel,
        activityLifestyle: v.activityLifestyle,
        clinicalCondition: v.clinicalCondition,
        aestheticPriorities: profile?.aestheticPriorities ?? [],
        performancePriorities: profile?.performancePriorities ?? [],
        trainingAgeYears: profile?.trainingAgeYears ?? null,
        notes: profile?.notes ?? null,
      });
      const measurement = {
        date: today,
        weightKg: v.weightKg,
        ...(v.bodyFatPct !== undefined
          ? { bodyFatPct: v.bodyFatPct, bodyFatMethod: v.bodyFatMethod ?? null }
          : {}),
      };
      if (weighInId) {
        // Corrige a pesagem criada nesta sessão; gordura apagada volta a nulo.
        await bodyApi.patch(weighInId, {
          ...measurement,
          ...(v.bodyFatPct === undefined ? { bodyFatPct: null, bodyFatMethod: null } : {}),
        });
      } else if (initialWeightKg !== v.weightKg || v.bodyFatPct !== undefined) {
        const created = await bodyApi.create(measurement);
        setWeighInId(created.measurement.id);
      }
      await qc.invalidateQueries();
      next();
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  const bodyFatValue = useWatch({ control, name: 'bodyFatPct' });
  const hasBodyFat = bodyFatValue !== undefined && bodyFatValue !== '';

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-5" noValidate>
      <Controller
        control={control}
        name="sex"
        render={({ field }) => (
          <ChoiceGroup
            name="sex"
            legend="Sexo (usado só nas fórmulas)"
            options={[
              { value: 'female', label: 'Feminino' },
              { value: 'male', label: 'Masculino' },
            ]}
            value={field.value}
            onChange={field.onChange}
            error={errors.sex ? 'Escolha uma opção' : undefined}
          />
        )}
      />
      <div className="grid grid-cols-2 gap-3">
        <FormField
          id="birthDate"
          label="Nascimento"
          type="date"
          error={errors.birthDate?.message}
          {...register('birthDate')}
        />
        <FormField
          id="heightCm"
          label="Altura (cm)"
          type="number"
          inputMode="decimal"
          error={errors.heightCm?.message}
          {...register('heightCm')}
        />
        <FormField
          id="weightKg"
          label="Peso hoje (kg)"
          type="number"
          step="0.1"
          inputMode="decimal"
          error={errors.weightKg?.message}
          {...register('weightKg')}
        />
        <FormField
          id="bodyFatPct"
          label="Gordura % (opcional)"
          type="number"
          step="0.1"
          inputMode="decimal"
          error={errors.bodyFatPct?.message}
          {...register('bodyFatPct')}
        />
      </div>
      {hasBodyFat ? (
        <div className="space-y-1.5">
          <Label htmlFor="bodyFatMethod">Como a gordura foi medida</Label>
          <Select id="bodyFatMethod" {...register('bodyFatMethod')}>
            <option value="">Selecione</option>
            {Object.entries(BODY_FAT_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          {errors.bodyFatMethod ? (
            <p className="text-sm text-destructive">{errors.bodyFatMethod.message}</p>
          ) : null}
        </div>
      ) : null}
      <Controller
        control={control}
        name="activityLifestyle"
        render={({ field }) => (
          <ChoiceGroup
            name="activityLifestyle"
            legend="Rotina fora do treino"
            options={(['sedentary', 'light', 'moderate', 'high'] as const).map((v) => ({
              value: v,
              label: LIFESTYLE_LABELS[v],
              hint: LIFESTYLE_HINTS[v],
            }))}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      <Controller
        control={control}
        name="trainingExperience"
        render={({ field }) => (
          <ChoiceGroup
            name="trainingExperience"
            legend="Experiência com musculação"
            columns={3}
            options={(['beginner', 'intermediate', 'advanced'] as const).map((v) => ({
              value: v,
              label: EXPERIENCE_LABELS[v],
            }))}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      <div className="space-y-1.5">
        <Label htmlFor="conditioningLevel">Condicionamento (1 = baixo, 5 = excelente)</Label>
        <input
          id="conditioningLevel"
          type="range"
          min={1}
          max={5}
          step={1}
          className="h-11 w-full accent-primary"
          {...register('conditioningLevel')}
        />
      </div>
      <label className="flex min-h-11 items-start gap-3 rounded-lg border border-border p-3 text-sm">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-primary"
          {...register('clinicalCondition')}
        />
        <span>
          Estou gestante, tenho doença, transtorno alimentar ou uso medicamento que afeta o peso.
          <span className="block text-xs text-muted-foreground">
            Nesses casos o Atlas não gera metas de calorias e recomenda acompanhamento profissional.
          </span>
        </span>
      </label>
      <StepNav pending={isSubmitting} error={error} />
    </form>
  );
}
