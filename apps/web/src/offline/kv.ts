/**
 * Armazenamento chave-valor em IndexedDB (ADR-034), separado por usuário: a fila e a sessão
 * ativa de uma pessoa nunca aparecem nem são enviadas com a conta de outra no mesmo aparelho.
 * Sem IndexedDB (ex.: SSR, testes), usa memória.
 */
const DB_NAME = 'atlas-offline';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;
const memory = new Map<string, unknown>();

let user: string | null = null;
let waiters: ((id: string) => void)[] = [];
const userListeners = new Set<(id: string) => void>();

/** Define o usuário dono dos dados offline (chamado ao carregar a sessão autenticada). */
export function setOfflineUser(id: string) {
  if (user === id) return;
  user = id;
  for (const w of waiters) w(id);
  waiters = [];
  for (const fn of userListeners) fn(id);
}

export function onOfflineUserChange(fn: (id: string) => void) {
  userListeners.add(fn);
  return () => {
    userListeners.delete(fn);
  };
}

/** Espera o usuário ser conhecido antes de ler ou gravar. */
function scoped(key: string): Promise<string> {
  if (user) return Promise.resolve(`${user}:${key}`);
  return new Promise((resolve) => {
    waiters.push((id) => {
      resolve(`${id}:${key}`);
    });
  });
}

function open(): Promise<IDBDatabase> | null {
  if (typeof indexedDB === 'undefined') return null;
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error('indexedDB open failed'));
    };
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) {
  const pending = open();
  if (!pending) return null;
  const db = await pending;
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error('indexedDB request failed'));
    };
  });
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const k = await scoped(key);
  if (typeof indexedDB === 'undefined') return memory.get(k) as T | undefined;
  return (await run('readonly', (s) => s.get(k) as IDBRequest<T | undefined>)) ?? undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const k = await scoped(key);
  if (typeof indexedDB === 'undefined') {
    memory.set(k, value);
    return;
  }
  await run('readwrite', (s) => s.put(value, k));
}

export async function kvDel(key: string): Promise<void> {
  const k = await scoped(key);
  if (typeof indexedDB === 'undefined') {
    memory.delete(k);
    return;
  }
  await run('readwrite', (s) => s.delete(k));
}

/** Apaga todos os dados offline do usuário atual neste aparelho (exclusão de conta, ADR-061). */
export async function kvClearUser(): Promise<void> {
  if (!user) return;
  const prefix = `${user}:`;
  if (typeof indexedDB === 'undefined') {
    for (const k of [...memory.keys()]) if (k.startsWith(prefix)) memory.delete(k);
    return;
  }
  const keys = (await run('readonly', (s) => s.getAllKeys())) ?? [];
  for (const k of keys)
    if (typeof k === 'string' && k.startsWith(prefix)) await run('readwrite', (s) => s.delete(k));
}
