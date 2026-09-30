'use client';

import { uuidv7 } from 'uuidv7';
import { create } from 'zustand';

import { kvGet, kvSet, onOfflineUserChange } from './kv';

/** Escrita pendente; `id` vira a `Idempotency-Key` (ADR-034). */
export interface QueuedOp {
  id: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  createdAt: string;
}

interface SyncState {
  pending: number;
  syncing: boolean;
  online: boolean;
  /** Última operação recusada pelo servidor (4xx); limpa no próximo envio aceito. */
  lastError: string | null;
}

export const useSyncStore = create<SyncState>(() => ({
  pending: 0,
  syncing: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  lastError: null,
}));

const KEY = 'queue';
const listeners = new Set<(op: QueuedOp, response: unknown) => void>();
let flushing: Promise<void> | null = null;
let chain: Promise<unknown> = Promise.resolve();

const hasLocks = () => typeof navigator !== 'undefined' && 'locks' in navigator;

/**
 * Toda alteração da fila é ler → alterar → gravar sob trava (Web Locks entre abas; cadeia de
 * promessas como alternativa), sempre a partir do que está gravado: nada enfileirado durante
 * um envio é sobrescrito.
 */
function withQueueLock<T>(fn: () => Promise<T>): Promise<T> {
  if (hasLocks()) return navigator.locks.request('atlas-queue', fn);
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

async function read(): Promise<QueuedOp[]> {
  return (await kvGet<QueuedOp[]>(KEY)) ?? [];
}

function mutate(fn: (q: QueuedOp[]) => QueuedOp[]): Promise<QueuedOp[]> {
  return withQueueLock(async () => {
    const q = fn(await read());
    await kvSet(KEY, q);
    useSyncStore.setState({ pending: q.length });
    return q;
  });
}

/** Avisado a cada operação confirmada pelo servidor (com a resposta). */
export function onSynced(fn: (op: QueuedOp, response: unknown) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function enqueue(op: Omit<QueuedOp, 'id' | 'createdAt'>) {
  const full: QueuedOp = { ...op, id: uuidv7(), createdAt: new Date().toISOString() };
  await mutate((q) => [...q, full]);
  void flush();
  return full;
}

export async function pendingOps(): Promise<QueuedOp[]> {
  return read();
}

type SendResult =
  | { kind: 'ok'; body: unknown }
  | { kind: 'retry'; offline: boolean }
  | { kind: 'rejected'; message: string };

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
    return { kind: 'retry', offline: true };
  }
  if (res.ok) {
    return { kind: 'ok', body: res.status === 204 ? null : await res.json().catch(() => null) };
  }
  // DELETE repetido (resposta anterior perdida) ou criação repetida em corrida: já aplicado.
  if ((op.method === 'DELETE' && res.status === 404) || res.status === 409) {
    return { kind: 'ok', body: null };
  }
  // 401 (sessão expirada), 429 e 5xx: tenta de novo depois; demais 4xx não vão passar.
  if (res.status === 401 || res.status === 429 || res.status >= 500) {
    return { kind: 'retry', offline: false };
  }
  const problem = (await res.json().catch(() => null)) as {
    detail?: string;
    title?: string;
  } | null;
  return {
    kind: 'rejected',
    message: problem?.detail ?? problem?.title ?? `HTTP ${String(res.status)}`,
  };
}

async function drain() {
  useSyncStore.setState({ syncing: true });
  try {
    for (;;) {
      const op = (await read())[0];
      if (!op) break;
      const result = await send(op);
      if (result.kind === 'retry') {
        useSyncStore.setState({ online: !result.offline });
        break;
      }
      // Remove pelo id: o que foi enfileirado durante o envio fica.
      await mutate((q) => q.filter((o) => o.id !== op.id));
      if (result.kind === 'ok') {
        useSyncStore.setState({ online: true, lastError: null });
        for (const fn of listeners) fn(op, result.body);
      } else {
        useSyncStore.setState({ lastError: result.message });
      }
    }
  } finally {
    useSyncStore.setState({ syncing: false, pending: (await read()).length });
  }
}

/** Envia em ordem; um só envio por vez entre abas; para no primeiro erro de rede. */
export function flush(): Promise<void> {
  flushing ??= (async () => {
    try {
      if (hasLocks()) {
        await navigator.locks.request('atlas-flush', { ifAvailable: true }, async (lock) => {
          if (lock) await drain();
        });
      } else {
        await drain();
      }
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

let started = false;
/** Liga a sincronização automática: ao voltar a rede, ao trocar de usuário e a cada 15 s. */
export function startSync() {
  if (started || typeof window === 'undefined') return;
  started = true;
  onOfflineUserChange(() => {
    useSyncStore.setState({ lastError: null });
    void read().then((q) => {
      useSyncStore.setState({ pending: q.length });
      void flush();
    });
  });
  window.addEventListener('online', () => {
    useSyncStore.setState({ online: true });
    void flush();
  });
  window.addEventListener('offline', () => {
    useSyncStore.setState({ online: false });
  });
  setInterval(() => {
    void read().then((q) => {
      useSyncStore.setState({ pending: q.length });
      if (q.length > 0) void flush();
    });
  }, 15_000);
}
