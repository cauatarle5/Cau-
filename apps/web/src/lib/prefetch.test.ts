import { runInThisContext } from 'node:vm';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PREFETCH_SCRIPT, takePrefetch } from './prefetch';

function run(pathname: string, session: unknown) {
  const fetched: string[] = [];
  const win: { __atlasPrefetch?: Record<string, unknown> } = {};
  vi.stubGlobal('window', win);
  vi.stubGlobal('location', { pathname });
  vi.stubGlobal('localStorage', {
    getItem: () => (session === undefined ? null : JSON.stringify(session)),
  });
  vi.stubGlobal('fetch', (url: string) => {
    fetched.push(url);
    return Promise.resolve(new Response('{}'));
  });
  runInThisContext(PREFETCH_SCRIPT);
  return { fetched, win };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('prefetch script (ADR-062)', () => {
  it('requests session, profile and the /hoje queries in the user time zone', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 02:00 UTC em 1º/out = ainda 30/set em São Paulo.
    vi.setSystemTime(new Date('2026-10-01T02:00:00Z'));
    const { fetched } = run('/hoje', { user: { timezone: 'America/Sao_Paulo' } });
    expect(fetched).toEqual([
      '/api/v1/auth/me',
      '/api/v1/profile',
      '/api/v1/daily-context/2026-09-30',
      '/api/v1/checkins/2026-09-30',
      '/api/v1/planned-workouts?from=2026-09-30&to=2026-10-07',
      '/api/v1/nutrition/day-summary?date=2026-09-30',
    ]);
  });

  it('only session and profile without a known user or on other screens', () => {
    expect(run('/hoje', undefined).fetched).toEqual(['/api/v1/auth/me', '/api/v1/profile']);
    expect(run('/treino', { user: { timezone: 'UTC' } }).fetched).toEqual([
      '/api/v1/auth/me',
      '/api/v1/profile',
    ]);
  });

  it('does nothing on public screens', () => {
    for (const p of ['/', '/entrar', '/cadastro', '/offline', '/onboarding'])
      expect(run(p, undefined).fetched).toEqual([]);
  });

  it('serves each prefetched response once and only during the initial load', () => {
    const { win } = run('/treino', undefined);
    const pending = win.__atlasPrefetch?.['/auth/me'];
    expect(pending).toBeInstanceOf(Promise);
    expect(takePrefetch('/auth/me')).toBe(pending);
    expect(takePrefetch('/auth/me')).toBeUndefined();
    // Depois do carregamento inicial, a resposta guardada é descartada.
    vi.spyOn(performance, 'now').mockReturnValue(60_000);
    expect(win.__atlasPrefetch?.['/profile']).toBeInstanceOf(Promise);
    expect(takePrefetch('/profile')).toBeUndefined();
  });
});
