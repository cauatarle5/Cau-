/** Idade em anos completos na data `on` (ambas `YYYY-MM-DD`). */
export function ageOn(birthDate: string, on: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = on.split('-').map(Number);
  if ([by, bm, bd, y, m, d].some((n) => n === undefined || Number.isNaN(n))) {
    throw new RangeError('dates must be YYYY-MM-DD');
  }
  const beforeBirthday =
    (m as number) < (bm as number) || (m === bm && (d as number) < (bd as number));
  return (y as number) - (by as number) - (beforeBirthday ? 1 : 0);
}

/** Dias inteiros entre duas datas `YYYY-MM-DD` (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
