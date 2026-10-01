// Service worker do Atlas (ADR-060). Escrito à mão, sem build: troque VERSION para invalidar.
// - /_next/static: cache-first (arquivos com hash, imutáveis).
// - Navegações: network-first; sem rede, a última cópia da página ou /offline.
// - /api: nunca passa pelo cache (dados do usuário; a fila offline cuida das escritas).
const VERSION = 'v2';
const STATIC = `atlas-static-${VERSION}`;
const PAGES = `atlas-pages-${VERSION}`;
const PRECACHE = ['/offline', '/icons/icon-192.png', '/manifest.webmanifest'];
// Limites dos caches: chunks antigos de deploys anteriores e páginas de treinos passados saem.
const MAX_STATIC = 300;
const MAX_PAGES = 40;

/** Remove as entradas mais antigas (ordem de inserção) acima do limite; o pré-cache fica. */
async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = (await cache.keys()).filter((k) => !PRECACHE.includes(new URL(k.url).pathname));
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)));
}

/** Só guarda respostas próprias, completas e sem redirecionamento (navegação recusa redirect). */
const cacheable = (res) => res.ok && res.type === 'basic' && !res.redirected;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('atlas-') && k !== STATIC && k !== PAGES)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    await trim(STATIC, MAX_STATIC);
  }
  return res;
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    if (cacheable(res)) {
      await cache.put(request, res.clone());
      await trim(PAGES, MAX_PAGES);
    }
    return res;
  } catch {
    return (
      (await cache.match(request)) ??
      (await cache.match(request, { ignoreSearch: true })) ??
      (await cache.match('/offline')) ??
      Response.error()
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(PAGES);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then(async (res) => {
      if (res.ok) await cache.put(request, res.clone());
      return res;
    })
    .catch(() => hit ?? Response.error());
  return hit ?? network;
}

// Navegações feitas no cliente (router do Next) não passam pelo SW: o app pede para guardar a
// página visitada, e ela abre sem rede depois (ex.: recarregar o treino ativo).
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'CACHE_PAGE' || typeof data.url !== 'string') return;
  const url = new URL(data.url, self.location.origin);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.waitUntil(
    caches.open(PAGES).then(async (cache) => {
      try {
        const res = await fetch(url, { credentials: 'same-origin' });
        if (cacheable(res)) {
          await cache.put(url, res);
          await trim(PAGES, MAX_PAGES);
        }
      } catch {
        // sem rede: fica a cópia anterior, se houver
      }
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
  } else if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(staleWhileRevalidate(request));
  }
});
