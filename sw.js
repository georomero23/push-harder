/* PUSH HARDER · service worker (modo sin señal)
 *
 * - La app (HTML/CSS/JS/catálogo/fuentes) y los SDK del CDN quedan guardados al instalarse.
 * - Archivos de la app: se sirven del caché al instante y se actualizan en segundo plano.
 *   index.html y js/config.js van primero a la red (con tiempo límite) para no quedarse viejos.
 * - Animaciones (media/): se guardan la primera vez que se ven o con "Preparar para el gym".
 * - Firebase (Auth/Firestore) NO pasa por aquí: Firestore tiene su propia caché offline.
 *
 * Si agregas o cambias archivos, corre:  python3 tools/build-sw.py   (actualiza la lista y la versión)
 */
// @@VERSION
const VERSION = 'ph-20261023-57c36998';
// @@END-VERSION

// @@ASSETS
const ASSETS = [
  "css/app.css",
  "data/catalog.json",
  "fonts/archivo-black.woff2",
  "fonts/archivo-var.woff2",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/icon.svg",
  "index.html",
  "js/app.js",
  "js/config.js",
  "js/engine/guard.js",
  "js/engine/increments.js",
  "js/engine/progression.js",
  "js/engine/volume.js",
  "js/firebase.js",
  "js/lib/catalog.js",
  "js/lib/deps.js",
  "js/lib/hooks.js",
  "js/lib/proposals.js",
  "js/lib/pwa.js",
  "js/lib/router.js",
  "js/lib/routine.js",
  "js/lib/session.js",
  "js/lib/store.js",
  "js/lib/ui.js",
  "js/pdf/export.js",
  "js/pdf/layout.js",
  "js/pdf/metrics.js",
  "js/version.js",
  "js/views/catalog.js",
  "js/views/custom-exercise.js",
  "js/views/exercise.js",
  "js/views/export.js",
  "js/views/home.js",
  "js/views/login.js",
  "js/views/offline.js",
  "js/views/picker.js",
  "js/views/profile.js",
  "js/views/proposals.js",
  "js/views/register.js",
  "js/views/routine-editor.js",
  "js/views/student.js",
  "js/views/students.js",
  "js/views/templates.js",
  "js/views/today.js",
  "js/views/train.js",
  "manifest.webmanifest",
];
// @@END-ASSETS

const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js',
  'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js',
];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'www.gstatic.com'];
const SHELL = `ph-shell-${VERSION}`;
const CDN = 'ph-cdn-v1';
const MEDIA = 'ph-media-v1';
const MEDIA_MAX = 1600;          // ~ todas las animaciones del catálogo
const NETWORK_FIRST = ['index.html', 'js/config.js'];
const TIMEOUT_MS = 2500;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await shell.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' })));
    const cdn = await caches.open(CDN);
    await Promise.all(CDN_ASSETS.map(async (url) => {
      if (await cdn.match(url)) return;
      try { const res = await fetch(url, { mode: 'cors' }); if (res.ok) await cdn.put(url, res); } catch { /* se intenta de nuevo al usarse */ }
    }));
    // Primera instalación: activa de inmediato. Actualizaciones: esperan a que el usuario acepte.
    if (!self.registration.active) self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('ph-shell-') && k !== SHELL).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'VERSION') event.source?.postMessage({ type: 'VERSION', version: VERSION });
});

const scopePath = new URL(self.registration.scope).pathname;
const rel = (url) => url.pathname.slice(scopePath.length);

async function trimMedia() {
  const cache = await caches.open(MEDIA);
  const keys = await cache.keys();
  if (keys.length > MEDIA_MAX) await Promise.all(keys.slice(0, keys.length - MEDIA_MAX).map((k) => cache.delete(k)));
}

async function fromCacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    if (cacheName === MEDIA) trimMedia();
  }
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(request);
  const update = fetch(request).then((res) => { if (res.ok) cache.put(request, res.clone()); return res; }).catch(() => null);
  return hit || (await update) || new Response('Sin conexión', { status: 503 });
}

async function networkFirst(request, cacheKey) {
  const cache = await caches.open(SHELL);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS)),
    ]);
    if (res.ok) await cache.put(cacheKey, res.clone());
    return res;
  } catch {
    return (await cache.match(cacheKey, { ignoreSearch: true })) || new Response('Sin conexión', { status: 503 });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    const path = rel(url);
    if (path === 'sw.js') return;
    if (request.mode === 'navigate') { event.respondWith(networkFirst(request, 'index.html')); return; }
    if (NETWORK_FIRST.includes(path)) { event.respondWith(networkFirst(request, path)); return; }
    if (path.startsWith('media/')) { event.respondWith(fromCacheFirst(MEDIA, request)); return; }
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  // SDKs con versión fija en la URL: nunca cambian, caché primero.
  if (CDN_HOSTS.includes(url.hostname) && (url.pathname.includes('@') || url.pathname.startsWith('/firebasejs/'))) {
    event.respondWith(fromCacheFirst(CDN, request));
  }
  // Todo lo demás (Firebase Auth, Firestore, URLs externas) va directo a la red.
});
