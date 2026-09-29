'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { registerInputSchema } from '@atlas/schemas';

import { applyApiErrors } from '../hooks/use-api-form-errors';
import { useRegister } from '../hooks/use-auth';

import { FormField } from './form-field';

type FormInput = z.input<typeof registerInputSchema>;
type FormOutput = z.output<typeof registerInputSchema>;

export function RegisterForm() {
  const router = useRouter();
  const registerMutation = useRegister();
  const [formError, setFormError] = useState('');
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(registerInputSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    try {
      await registerMutation.mutateAsync(values);
      router.replace('/hoje');
    } catch (error) {
      setFormError(applyApiErrors(error, ['name', 'email', 'password'], setError));
    }
  });

  return (
    <Card className="space-y-6">
      <div className="space-y-1">
        <CardTitle>Criar conta</CardTitle>
        <CardDescription>Comece a registrar treino, alimentação e recuperação.</CardDescription>
      </div>
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4" noValidate>
        <FormField
          id="name"
          label="Nome"
          autoComplete="name"
          error={errors.name?.message}
          {...register('name')}
        />
        <FormField
          id="email"
          label="E-mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <FormField
          id="password"
          label="Senha"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        {formError ? (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Criando…' : 'Criar conta'}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{' '}
        <Link
          href="/entrar"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Entrar
        </Link>
      </p>
    </Card>
  );
}
