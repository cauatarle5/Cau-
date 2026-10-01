'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useOnboarding } from '@/features/onboarding/store';
import { forgetSession } from '@/offline/last-session';
import type { LoginInput, RegisterInput } from '@atlas/schemas';

import { authApi } from '../api';

export const meQueryKey = ['auth', 'me'] as const;

export function useMe() {
  return useQuery({ queryKey: meQueryKey, queryFn: authApi.me });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: (data) => {
      qc.setQueryData(meQueryKey, data);
    },
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) => authApi.register(input),
    onSuccess: (data) => {
      qc.setQueryData(meQueryKey, data);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      forgetSession();
      qc.clear();
      useOnboarding.getState().reset();
    },
  });
}
