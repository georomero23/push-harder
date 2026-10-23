// Instalar la app, aviso de versión nueva y "Preparar para el gym" (animaciones sin señal).
import { html, useState, useEffect } from '../lib/deps.js';
import { useStore, toast } from '../lib/store.js';
import { useExerciseIndex } from '../lib/hooks.js';
import { isStandalone, isIOS, promptInstall, applyUpdate, prefetchMedia, routineMediaUrls, persistStorage } from '../lib/pwa.js';
import { Icon } from '../lib/ui.js';

const DISMISS_KEY = 'ph-install-dismissed';
const readFlag = () => { try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } };
const writeFlag = () => { try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* sin almacenamiento */ } };

/** Tarjeta para instalar la app en el celular. compact = la de Inicio (se puede cerrar). */
export function InstallCard({ compact = false }) {
  const ev = useStore((s) => s.installEvent);
  const installed = useStore((s) => s.installed);
  const [hidden, setHidden] = useState(readFlag);
  if (isStandalone() || installed || (compact && hidden)) return null;
  const ios = isIOS();
  if (!ev && !ios) {
    if (compact) return null;
    return html`<p class="hint">Para instalarla: abre el menú del navegador (⋮) → <b>Instalar app</b> o <b>Agregar a pantalla principal</b>.</p>`;
  }
  return html`<div class="install">
    <span class="install-ico"><img src="icons/icon-192.png" alt="" width="44" height="44" /></span>
    <div class="grow">
      <b>Instala PUSH HARDER</b>
      ${ios
        ? html`<small>En iPhone: toca <b>Compartir</b> <span aria-hidden="true">⬆︎</span> y luego <b>Agregar a inicio</b>. Así abre a pantalla completa y funciona sin señal.</small>`
        : html`<small>Ábrela como app y entrena sin señal en el gym.</small>`}
    </div>
    ${!ios && html`<button class="btn btn-sm btn-primary" onClick=${() => promptInstall()}>Instalar</button>`}
    ${compact && html`<button class="mini-btn" aria-label="Cerrar" onClick=${() => { writeFlag(); setHidden(true); }}><${Icon} name="close" size="16" /></button>`}
  </div>`;
}

/** Barra fija cuando hay una versión nueva descargada. */
export function UpdateBanner() {
  const ready = useStore((s) => s.updateReady);
  if (!ready) return null;
  return html`<div class="update-bar" role="status">
    <span class="grow">Nueva versión lista</span>
    <button class="btn btn-sm btn-primary" onClick=${applyUpdate}>Actualizar</button>
  </div>`;
}

/** Descarga todas las animaciones de la rutina para entrenar sin señal. */
export function OfflinePrep({ routine, block = false }) {
  const exIndex = useExerciseIndex();
  const online = useStore((s) => s.online);
  const [state, setState] = useState(null); // null | {done,total} | {ok,total,finished}
  // ¿Ya estaba todo guardado? (para no pedir de nuevo después de recargar)
  useEffect(() => {
    if (!routine || !exIndex.size || typeof caches === 'undefined') return;
    const urls = routineMediaUrls(routine, exIndex);
    Promise.all(urls.map((u) => caches.match(u))).then((hits) => {
      const ok = hits.filter(Boolean).length;
      if (urls.length && ok === urls.length) setState({ ok, total: urls.length, finished: true });
    }).catch(() => {});
  }, [routine?.id, routine?.version, exIndex.size]);
  if (!routine) return null;

  async function run() {
    const urls = routineMediaUrls(routine, exIndex);
    setState({ done: 0, total: urls.length });
    await persistStorage();
    const r = await prefetchMedia(urls, (done, total) => setState({ done, total }));
    setState({ ...r, finished: true });
    toast(r.ok === r.total ? 'Listo: tu rutina queda disponible sin señal' : `Se guardaron ${r.ok} de ${r.total} animaciones`);
  }

  const label = !state ? 'Preparar para el gym'
    : state.finished ? `Lista sin señal · ${state.ok}/${state.total}`
      : `Guardando animaciones ${state.done}/${state.total}…`;
  return html`<button class=${`btn ${block ? 'btn-block' : 'btn-sm'} ${state?.finished ? '' : ''}`} disabled=${!online || (state && !state.finished)} onClick=${run}
    title="Descarga las animaciones de tu rutina para verlas sin internet">
    <${Icon} name=${state?.finished ? 'check' : 'offline'} size="18" />${online ? label : 'Sin señal: ya usas lo guardado'}
  </button>`;
}
