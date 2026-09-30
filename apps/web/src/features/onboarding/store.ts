'use client';

import { create } from 'zustand';

export const ONBOARDING_STEPS = [
  'Dados básicos',
  'Objetivo',
  'Rotina',
  'Equipamentos',
  'Limitações',
  'Esportes',
] as const;

interface OnboardingState {
  /** 0..5 = etapas; 6 = resultado. */
  step: number;
  /** Pesagem criada nesta sessão de onboarding (para corrigir em vez de duplicar). */
  weighInId: string | null;
  goalKey: string | null;
  setStep: (step: number) => void;
  next: () => void;
  back: () => void;
  setWeighInId: (id: string) => void;
  setGoalKey: (key: string) => void;
}

/** Rascunho do onboarding em memória (Zustand, PROMPT_MESTRE 3.1). */
export const useOnboarding = create<OnboardingState>((set) => ({
  step: 0,
  weighInId: null,
  goalKey: null,
  setStep: (step) => {
    set({ step });
  },
  next: () => {
    set((s) => ({ step: Math.min(s.step + 1, ONBOARDING_STEPS.length) }));
  },
  back: () => {
    set((s) => ({ step: Math.max(s.step - 1, 0) }));
  },
  setWeighInId: (id) => {
    set({ weighInId: id });
  },
  setGoalKey: (key) => {
    set({ goalKey: key });
  },
}));
