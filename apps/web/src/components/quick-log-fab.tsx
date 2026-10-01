'use client';

import {
  Activity,
  ArrowLeft,
  Droplet,
  Dumbbell,
  HeartPulse,
  Plus,
  Scale,
  Utensils,
  X,
  type LucideIcon,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { WeighInForm } from '@/features/body/components/weigh-in-form';
import { QuickLog } from '@/features/nutrition/components/quick-log';
import { WaterCard } from '@/features/nutrition/components/water-card';
import { ActivityForm } from '@/features/recovery/components/activity-form';
import { CheckinCard } from '@/features/recovery/components/checkin-card';
import { activeSessionId } from '@/features/training/active-store';
import { useToday } from '@/lib/use-today';

type Kind = 'meal' | 'workout' | 'checkin' | 'weight' | 'activity' | 'water';

// Ordem da P12.1.
const OPTIONS: readonly { kind: Kind; label: string; icon: LucideIcon }[] = [
  { kind: 'meal', label: 'Refeição', icon: Utensils },
  { kind: 'workout', label: 'Série/Treino', icon: Dumbbell },
  { kind: 'checkin', label: 'Check-in', icon: HeartPulse },
  { kind: 'weight', label: 'Peso', icon: Scale },
  { kind: 'activity', label: 'Atividade', icon: Activity },
  { kind: 'water', label: 'Água', icon: Droplet },
];

/** Telas cujo controle principal fica embaixo e já é o próprio registro. */
const HIDDEN_ON = ['/treino/sessao/', '/coach'];

function Form({ kind, today }: { kind: Exclude<Kind, 'workout'>; today: string }): ReactNode {
  switch (kind) {
    case 'meal':
      return <QuickLog date={today} />;
    case 'checkin':
      return <CheckinCard date={today} />;
    case 'weight':
      return <WeighInForm />;
    case 'activity':
      return <ActivityForm today={today} />;
    case 'water':
      return <WaterCard date={today} />;
  }
}

/** Botão flutuante de registro rápido (P12.1), com os formulários existentes num diálogo. */
export function QuickLogFab() {
  const pathname = usePathname();
  const router = useRouter();
  const today = useToday();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<Exclude<Kind, 'workout'> | null>(null);
  const [open, setOpen] = useState(false);

  // Fecha ao trocar de tela.
  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  if (HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  const show = () => {
    setKind(null);
    dialogRef.current?.showModal();
    setOpen(true);
  };
  const close = () => {
    dialogRef.current?.close();
  };

  const choose = (k: Kind) => {
    if (k !== 'workout') {
      setKind(k);
      return;
    }
    close();
    void activeSessionId().then((id) => {
      router.push(id ? `/treino/sessao/${id}` : '/treino');
    });
  };

  const title = kind ? (OPTIONS.find((o) => o.kind === kind)?.label ?? '') : 'Registro rápido';

  return (
    <>
      <button
        type="button"
        aria-label="Registro rápido"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={show}
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-20 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:bottom-6 lg:right-6"
      >
        <Plus className="size-6" aria-hidden />
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="quick-log-title"
        onClose={() => {
          setOpen(false);
          setKind(null);
        }}
        className="m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-border bg-background p-4 text-foreground backdrop:bg-black/40 sm:m-auto sm:max-w-lg sm:rounded-2xl"
      >
        <div className="mb-3 flex items-center gap-2">
          {kind ? (
            <button
              type="button"
              aria-label="Voltar"
              onClick={() => {
                setKind(null);
              }}
              className="flex size-11 items-center justify-center rounded-lg hover:bg-muted"
            >
              <ArrowLeft className="size-5" aria-hidden />
            </button>
          ) : null}
          <h2 id="quick-log-title" className="flex-1 text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={close}
            className="flex size-11 items-center justify-center rounded-lg hover:bg-muted"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {open && kind ? (
          <Form kind={kind} today={today} />
        ) : (
          <ul className="grid grid-cols-3 gap-2" aria-label="O que registrar">
            {OPTIONS.map(({ kind: k, label, icon: Icon }) => (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => {
                    choose(k);
                  }}
                  className="flex min-h-20 w-full flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card p-2 text-sm hover:bg-muted"
                >
                  <Icon className="size-6 text-primary" aria-hidden />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </dialog>
    </>
  );
}
