import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { parseDecimal } from '@/lib/format';

import { kvGet, setOfflineUser } from './kv';
import { enqueue, flush, pendingOps, useSyncStore } from './queue';

interface Deferred {
  resolve: (res: Response) => void;
}

function deferredFetch() {
  const calls: { url: string; init: RequestInit; d: Deferred }[] = [];
  const fn = vi.fn((url: string, init: RequestInit) => {
    return new Promise<Response>((resolve) => {
      calls.push({ url, init, d: { resolve } });
    });
  });
  return { fn, calls };
}

const ok = () => new Response(JSON.stringify({}), { status: 201 });
const tick = () => new Promise((r) => setTimeout(r, 0));
async function until(cond: () => boolean) {
  for (let i = 0; i < 200 && !cond(); i++) await tick();
}

describe('offline queue (ADR-034)', () => {
  beforeAll(() => {
    setOfflineUser('user-a');
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await flush();
  });

  it('keeps ops enqueued while a send is in flight and sends them in order', async () => {
    const f = deferredFetch();
    vi.stubGlobal('fetch', f.fn);
    await enqueue({ method: 'POST', path: '/a', body: { n: 1 } });
    await until(() => f.calls.length === 1);
    // Enfileirado durante o envio de /a (ex.: "Salvar treino" logo após a última série).
    await enqueue({ method: 'PATCH', path: '/b', body: { finish: true } });
    f.calls[0]?.d.resolve(ok());
    await until(() => f.calls.length === 2);
    expect(f.calls[1]?.url).toBe('/api/v1/b');
    f.calls[1]?.d.resolve(ok());
    await flush();
    await until(() => useSyncStore.getState().pending === 0);
    expect(await pendingOps()).toEqual([]);
    expect(f.calls.map((c) => c.url)).toEqual(['/api/v1/a', '/api/v1/b']);
    const headers = f.calls[0]?.init.headers as Record<string, string>;
    expect(headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('stops on network errors and retries later without losing ops', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('offline'))),
    );
    await enqueue({ method: 'POST', path: '/c' });
    await flush();
    expect((await pendingOps()).map((o) => o.path)).toEqual(['/c']);
    expect(useSyncStore.getState().online).toBe(false);

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(ok())),
    );
    await flush();
    expect(await pendingOps()).toEqual([]);
    expect(useSyncStore.getState().online).toBe(true);
  });

  it('treats a repeated DELETE (404) as done and drops other 4xx with an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          url.endsWith('/sets/x')
            ? new Response(null, { status: 404 })
            : new Response(JSON.stringify({ detail: 'Dados inválidos' }), { status: 400 }),
        ),
      ),
    );
    await enqueue({ method: 'DELETE', path: '/sets/x' });
    await flush();
    expect(useSyncStore.getState().lastError).toBeNull();
    await enqueue({ method: 'POST', path: '/bad' });
    await flush();
    expect(await pendingOps()).toEqual([]);
    expect(useSyncStore.getState().lastError).toBe('Dados inválidos');
  });

  it('scopes stored data by user', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('offline'))),
    );
    await enqueue({ method: 'POST', path: '/mine' });
    setOfflineUser('user-b');
    expect(await kvGet('queue')).toBeUndefined();
    setOfflineUser('user-a');
    expect(((await kvGet<{ path: string }[]>('queue')) ?? []).map((o) => o.path)).toContain(
      '/mine',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(ok())),
    );
    await flush();
  });
});

describe('parseDecimal', () => {
  it('accepts comma or dot and rejects incomplete input', () => {
    expect(parseDecimal('22,5')).toBe(22.5);
    expect(parseDecimal('22.5')).toBe(22.5);
    expect(parseDecimal('100')).toBe(100);
    expect(parseDecimal('22,')).toBeNull();
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('1.000,5')).toBeNull();
  });
});
