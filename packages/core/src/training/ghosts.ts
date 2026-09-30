import type { SetLike } from './metrics';

export interface Ghost {
  setIndex: number;
  loadKg: number | null;
  reps: number | null;
  rir: number | null;
}

/**
 * Valores fantasma (P8.3/P12.3): o que foi feito na última sessão do exercício, por
 * índice de série; séries além das anteriores repetem a última working.
 */
export function ghostsFor(
  setCount: number,
  lastSession: readonly (SetLike & { setIndex: number })[],
): Ghost[] {
  const working = lastSession
    .filter((s) => s.setType === 'working' && s.completed)
    .sort((a, b) => a.setIndex - b.setIndex);
  return Array.from({ length: setCount }, (_, i) => {
    const src = working[i] ?? working.at(-1);
    return {
      setIndex: i,
      loadKg: src?.loadKg ?? null,
      reps: src?.reps ?? null,
      rir: src?.rir ?? null,
    };
  });
}
