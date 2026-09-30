'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

import { activeActions, useActiveWorkout } from '../active-store';

const fmt = (s: number) => `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`;

/** Descanso automático após cada série; vibra ao terminar (P12.3). */
export function RestTimer() {
  const rest = useActiveWorkout((s) => s.rest);
  const [now, setNow] = useState(() => Date.now());
  const buzzed = useRef<number | null>(null);

  useEffect(() => {
    if (!rest) return;
    const t = setInterval(() => {
      setNow(Date.now());
    }, 250);
    return () => {
      clearInterval(t);
    };
  }, [rest]);

  const left = rest ? Math.max(0, Math.ceil((rest.endsAt - now) / 1000)) : 0;

  useEffect(() => {
    if (rest && left === 0 && buzzed.current !== rest.endsAt) {
      buzzed.current = rest.endsAt;
      // iOS Safari não tem vibração.
      if ('vibrate' in navigator) navigator.vibrate([300, 150, 300]);
    }
  }, [rest, left]);

  if (!rest) return null;
  return (
    <div
      role="timer"
      aria-label="Descanso"
      className="fixed inset-x-0 bottom-16 z-20 mx-auto flex max-w-md items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 shadow-lg lg:bottom-6"
    >
      <div>
        <p className="text-xs text-muted-foreground">
          {left === 0 ? 'Descanso concluído' : 'Descanso'}
        </p>
        <p className="text-2xl font-semibold tabular-nums">{fmt(left)}</p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => {
            activeActions.addRest(15);
          }}
        >
          +15 s
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            activeActions.clearRest();
          }}
        >
          {left === 0 ? 'Fechar' : 'Pular'}
        </Button>
      </div>
    </div>
  );
}
