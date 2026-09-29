export const LB_IN_KG = 0.45359237;

/** Multiplica por 10^exp manipulando o expoente decimal, sem erro binário (ex.: 1.005 × 100). */
function shiftDecimal(value: number, exp: number): number {
  const [mantissa, currentExp = '0'] = String(value).split('e');
  return Number(`${mantissa ?? '0'}e${Number(currentExp) + exp}`);
}

/** Arredonda `value` para `decimals` casas (half away from zero). */
export function roundTo(value: number, decimals = 0): number {
  if (!Number.isFinite(value)) throw new RangeError('value must be finite');
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new RangeError('decimals must be a non-negative integer');
  }
  const rounded = shiftDecimal(Math.round(shiftDecimal(Math.abs(value), decimals)), -decimals);
  return rounded === 0 ? 0 : Math.sign(value) * rounded;
}

/** Converte libras para quilogramas (unidade interna). */
export function lbToKg(lb: number): number {
  return lb * LB_IN_KG;
}
