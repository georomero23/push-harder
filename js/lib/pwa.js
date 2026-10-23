// PWA: registro del service worker, aviso de actualización, instalación y modo sin señal.
import { store, toast } from './store.js';
import { mediaOf } from './catalog.js';

let registration = null;

export function initPWA() {
  // Botón "Instalar" (Android/Chrome): el navegador avisa cuándo se puede instalar.
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); store.set({ installEvent: e }); });
  addEventListener('appinstalled', () => { store.set({ installEvent: null, installed: true }); toast('App instalada'); });

  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !store.get().updateAccepted) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    if (!reg) return;
    registration = reg;
    const watch = (w) => w && w.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) store.set({ updateReady: w });
    });
    if (reg.waiting && navigator.serviceWorker.controller) store.set({ updateReady: reg.waiting });
    reg.addEventListener('updatefound', () => watch(reg.installing));
    // Revisa si hay versión nueva al volver a la app.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch((e) => console.warn('Service worker no disponible', e));
}

export function applyUpdate() {
  const w = store.get().updateReady;
  store.set({ updateAccepted: true });
  if (w) w.postMessage('SKIP_WAITING'); else location.reload();
}

export const checkForUpdate = () => registration?.update();

export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export async function promptInstall() {
  const e = store.get().installEvent;
  if (!e) return false;
  e.prompt();
  const { outcome } = await e.userChoice;
  store.set({ installEvent: null });
  return outcome === 'accepted';
}

/** Pide al navegador no borrar los datos guardados (rutina, sesiones en cola, animaciones). */
export async function persistStorage() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}

export async function storageEstimate() {
  try { const e = await navigator.storage?.estimate?.(); return e ? { usedMB: e.usage / 1048576, quotaMB: e.quota / 1048576 } : null; } catch { return null; }
}

/** URLs de las animaciones de una rutina (cuadros completos y miniaturas). */
export function routineMediaUrls(routine, exIndex, onlyDayId = null) {
  const urls = new Set();
  for (const d of routine?.days || []) {
    if (onlyDayId && d.id !== onlyDayId) continue;
    for (const s of d.slots) {
      const ex = exIndex.get(s.exId);
      if (!ex) continue;
      for (const size of ['full', 'thumb']) {
        for (const u of mediaOf(ex, size).frames) if (u && !/^https?:/i.test(u)) urls.add(u);
      }
    }
  }
  return [...urls];
}

/**
 * Descarga las animaciones para tenerlas sin señal (el service worker las guarda).
 * @returns {Promise<{ok:number,total:number}>}
 */
export async function prefetchMedia(urls, onProgress = () => {}) {
  let ok = 0; let i = 0; let done = 0;
  const worker = async () => {
    while (i < urls.length) {
      const url = urls[i++];
      try { const r = await fetch(url); if (r.ok) ok++; } catch { /* sin red */ }
      onProgress(++done, urls.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, urls.length) }, worker));
  return { ok, total: urls.length };
}

/** Precarga discreta del día que sigue (solo con red y sin ahorro de datos). */
let quietDone = '';
export function quietPrefetch(routine, dayId, exIndex) {
  const key = `${routine?.id}:${routine?.version}:${dayId}`;
  if (!routine || !navigator.onLine || navigator.connection?.saveData || quietDone === key || !exIndex.size) return;
  quietDone = key;
  const urls = routineMediaUrls(routine, exIndex, dayId);
  setTimeout(() => prefetchMedia(urls), 1500);
}
