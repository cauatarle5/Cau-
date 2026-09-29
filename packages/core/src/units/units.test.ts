import { describe, expect, it } from 'vitest';

import { lbToKg, roundTo } from './index';

describe('roundTo', () => {
  it.each([
    [1.005, 2, 1.01],
    [2.5, 0, 3],
    [-2.5, 0, -3],
    [80.04, 1, 80],
    [0, 3, 0],
    [1e-7, 2, 0],
    [1.23e-5, 6, 0.000012],
  ])('roundTo(%d, %d) = %d', (value, decimals, expected) => {
    expect(roundTo(value, decimals)).toBe(expected);
  });

  it('rejects invalid input', () => {
    expect(() => roundTo(Number.NaN)).toThrow(RangeError);
    expect(() => roundTo(1, -1)).toThrow(RangeError);
    expect(() => roundTo(1, 1.5)).toThrow(RangeError);
  });
});

describe('lbToKg', () => {
  it('converts pounds to kilograms', () => {
    expect(lbToKg(1)).toBeCloseTo(0.45359237, 8);
    expect(roundTo(lbToKg(220), 2)).toBe(99.79);
  });
});
