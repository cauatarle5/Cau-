'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { loginInputSchema } from '@atlas/schemas';

import { applyApiErrors } from '../hooks/use-api-form-errors';
import { useLogin } from '../hooks/use-auth';

import { FormField } from './form-field';

type FormInput = z.input<typeof loginInputSchema>;
type FormOutput = z.output<typeof loginInputSchema>;

export function LoginForm() {
  const router = useRouter();
  const loginMutation = useLogin();
  const [formError, setFormError] = useState('');
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(loginInputSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    try {
      await loginMutation.mutateAsync(values);
      router.replace('/hoje');
    } catch (error) {
      setFormError(applyApiErrors(error, ['email', 'password'], setError));
    }
  });

  return (
    <Card className="space-y-6">
      <div className="space-y-1">
        <CardTitle>Entrar</CardTitle>
        <CardDescription>Acesse sua central de treino e nutrição.</CardDescription>
      </div>
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4" noValidate>
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
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        {formError ? (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Não tem conta?{' '}
        <Link
          href="/cadastro"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Criar conta
        </Link>
      </p>
    </Card>
  );
}
