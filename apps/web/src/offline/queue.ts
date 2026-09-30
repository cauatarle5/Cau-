'use client';

import { uuidv7 } from 'uuidv7';
import { create } from 'zustand';

import { kvGet, kvSet } from './kv';

/** Escrita pendente; `id` vira a `Idempotency-Key` (ADR-034). */
export interface QueuedOp {
  id: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  createdAt: string;
  /** Enfileirada sem rede: a sessão é marcada `offline_sync` ao finalizar. */
  offline: boolean;
}

interface SyncState {
  pending: number;
  syncing: boolean;
  online: boolean;
  /** Última operação descartada por erro de validação (4xx). */
  lastError: string | null;
}

export const useSyncStore = create<SyncState>(() => ({
  pending: 0,
  syncing: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  lastError: null,
}));

const KEY = 'queue';
let queue: QueuedOp[] | null = null;
let flushing: Promise<void> | null = null;
const listeners = new Set<(op: QueuedOp, response: unknown) => void>();

async function load(): Promise<QueuedOp[]> {
  queue ??= (await kvGet<QueuedOp[]>(KEY)) ?? [];
  useSyncStore.setState({ pending: queue.length });
  return queue;
}

async function save(q: QueuedOp[]) {
  queue = q;
  useSyncStore.setState({ pending: q.length });
  await kvSet(KEY, q);
}

/** Avisado a cada operação confirmada pelo servidor (com a resposta). */
export function onSynced(fn: (op: QueuedOp, response: unknown) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function enqueue(op: Omit<QueuedOp, 'id' | 'createdAt' | 'offline'>) {
  const q = await load();
  const full: QueuedOp = {
    ...op,
    id: uuidv7(),
    createdAt: new Date().toISOString(),
    offline: typeof navigator !== 'undefined' && !navigator.onLine,
  };
  await save([...q, full]);
  void flush();
  return full;
}

export async function pendingOps(): Promise<QueuedOp[]> {
  return [...(await load())];
}

type SendResult = { ok: true; body: unknown } | { ok: false; retry: boolean; message: string };

async function send(op: QueuedOp): Promise<SendResult> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${op.path}`, {
      method: op.method,
      credentials: 'same-origin',
      headers: {
        'idempotency-key': op.id,
        ...(op.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: op.body === undefined ? undefined : JSON.stringify(op.body),
    });
  } catch {
    return { ok: false, retry: true, message: 'offline' };
  }
  if (res.ok) {
    return { ok: true, body: res.status === 204 ? null : await res.json().catch(() => null) };
  }
  // 401 (sessão expirada), 429 e 5xx: tenta de novo depois; demais 4xx não vão passar.
  const retry = res.status === 401 || res.status === 429 || res.status >= 500;
  const problem = (await res.json().catch(() => null)) as {
    detail?: string;
    title?: string;
  } | null;
  return { ok: false, retry, message: problem?.detail ?? problem?.title ?? `HTTP ${res.status}` };
}

/** Envia em ordem; para no primeiro erro de rede para preservar a sequência. */
export function flush(): Promise<void> {
  flushing ??= (async () => {
    useSyncStore.setState({ syncing: true });
    try {
      for (;;) {
        const q = await load();
        const op = q[0];
        if (!op) break;
        const result = await send(op);
        if (!result.ok && result.retry) {
          useSyncStore.setState({ online: result.message !== 'offline' });
          break;
        }
        await save(q.slice(1));
        if (result.ok) {
          useSyncStore.setState({ online: true });
          for (const fn of listeners) fn(op, result.body);
        } else {
          useSyncStore.setState({ lastError: result.message });
        }
      }
    } finally {
      useSyncStore.setState({ syncing: false });
      flushing = null;
    }
  })();
  return flushing;
}

let started = false;
/** Liga a sincronização automática: ao voltar a rede e a cada 15 s. */
export function startSync() {
  if (started || typeof window === 'undefined') return;
  started = true;
  void load().then(() => flush());
  window.addEventListener('online', () => {
    useSyncStore.setState({ online: true });
    void flush();
  });
  window.addEventListener('offline', () => {
    useSyncStore.setState({ online: false });
  });
  setInterval(() => {
    if ((queue?.length ?? 0) > 0) void flush();
  }, 15_000);
}
