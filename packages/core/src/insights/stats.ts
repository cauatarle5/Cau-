/** Coeficiente de correlação de Pearson; `null` com menos de 2 pares ou variância nula. */
export function pearson(pairs: readonly (readonly [number, number])[]): number | null {
  const n = pairs.length;
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of pairs) {
    sx += x;
    sy += y;
  }
  const mx = sx / n;
  const my = sy / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (const [x, y] of pairs) {
    cov += (x - mx) * (y - my);
    vx += (x - mx) ** 2;
    vy += (y - my) ** 2;
  }
  if (vx === 0 || vy === 0) return null;
  return cov / Math.sqrt(vx * vy);
}

export const mean = (xs: readonly number[]) =>
  xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
