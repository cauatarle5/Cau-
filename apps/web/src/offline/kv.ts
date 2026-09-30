/**
 * Armazenamento chave-valor em IndexedDB (ADR-034). Sem IndexedDB (ex.: SSR), usa memória.
 */
const DB_NAME = 'atlas-offline';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;
const memory = new Map<string, unknown>();

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
  if (typeof indexedDB === 'undefined') return memory.get(key) as T | undefined;
  return (await run('readonly', (s) => s.get(key) as IDBRequest<T | undefined>)) ?? undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    memory.set(key, value);
    return;
  }
  await run('readwrite', (s) => s.put(value, key));
}

export async function kvDel(key: string): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    memory.delete(key);
    return;
  }
  await run('readwrite', (s) => s.delete(key));
}
