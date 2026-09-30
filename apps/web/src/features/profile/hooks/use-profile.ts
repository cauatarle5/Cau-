'use client';

import { useQuery } from '@tanstack/react-query';

import { profileApi } from '../api';

export const profileKeys = {
  profile: ['profile'] as const,
  availability: ['availability'] as const,
  equipment: ['equipment'] as const,
  limitations: ['limitations'] as const,
  sports: ['sports'] as const,
  goals: ['goals'] as const,
};

export const useProfile = () =>
  useQuery({ queryKey: profileKeys.profile, queryFn: profileApi.get });
export const useAvailability = () =>
  useQuery({ queryKey: profileKeys.availability, queryFn: profileApi.availability });
export const useEquipment = () =>
  useQuery({ queryKey: profileKeys.equipment, queryFn: profileApi.equipment });
export const useLimitations = () =>
  useQuery({ queryKey: profileKeys.limitations, queryFn: profileApi.limitations });
export const useSports = () =>
  useQuery({ queryKey: profileKeys.sports, queryFn: profileApi.sports });
export const useGoals = () => useQuery({ queryKey: profileKeys.goals, queryFn: profileApi.goals });
