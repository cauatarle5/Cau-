import { describe, expect, it } from 'vitest';

import { nextOfflineMode } from './offline-mode';

describe('nextOfflineMode (ADR-060)', () => {
  it('turns on with a network error and no data, and stays on while refetching', () => {
    expect(nextOfflineMode(false, { networkError: true, hasData: false })).toBe(true);
    expect(nextOfflineMode(true, { networkError: false, hasData: false })).toBe(true);
  });

  it('turns off when data arrives or the session ends', () => {
    expect(nextOfflineMode(true, { networkError: false, hasData: true })).toBe(false);
    expect(nextOfflineMode(true, { networkError: false, hasData: false, reset: true })).toBe(false);
  });

  it('is stable with cached data and a failed background refetch (no render loop)', () => {
    let mode = false;
    for (let i = 0; i < 5; i++) {
      const next = nextOfflineMode(mode, { networkError: true, hasData: true });
      expect(next).toBe(mode);
      mode = next;
    }
    expect(nextOfflineMode(true, { networkError: true, hasData: true })).toBe(false);
    expect(nextOfflineMode(false, { networkError: true, hasData: true })).toBe(false);
  });
});
