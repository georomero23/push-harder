// Componentes compartidos: íconos, animación de ejercicio, barra superior, hoja inferior, avisos.
import { html, useState, useEffect, useRef, useMemo } from './deps.js';
import { mediaOf } from './catalog.js';
import { useStore } from './store.js';
import { back as goBack } from './router.js';

// ---------- Íconos (trazo 2px, 24×24) ----------
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.8.7 3 2.4 3.5 5.2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.2-6 8-6s7 2 8 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  offline: '<path d="M2 8.8a15 15 0 0 1 4.2-2.6M10.7 5.1A15 15 0 0 1 22 8.8M5 12.5a10 10 0 0 1 5.2-2.7M16.8 11a10 10 0 0 1 2.2 1.5M8.5 16a5 5 0 0 1 7 0M12 20h.01M2 2l20 20"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14 9l2 2"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  alert: '<path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5M12 18h.01"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  swap: '<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
};

export function Icon({ name, size }) {
  return html`<svg viewBox="0 0 24 24" width=${size || 24} height=${size || 24} fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
    dangerouslySetInnerHTML=${{ __html: P[name] || '' }}></svg>`;
}

// ---------- Animación de ejercicio ----------
// Los ejercicios base traen 2 cuadros: se alternan con crossfade solo mientras la tarjeta
// está en pantalla. Las imágenes no se piden hasta que la tarjeta se acerca al viewport.
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const io = typeof IntersectionObserver === 'function'
  ? new IntersectionObserver((entries) => entries.forEach((e) => e.target.__vis?.(e.isIntersecting)), { rootMargin: '250px 0px' })
  : null;

export function ExAnim({ ex, size = 'full', eager = false, interval = 850, className = '' }) {
  const ref = useRef();
  const vref = useRef();
  const media = useMemo(() => mediaOf(ex, size), [ex.id, ex.media?.src, size]);
  const [seen, setSeen] = useState(eager || !io);
  const [visible, setVisible] = useState(eager || !io);
  const [loaded, setLoaded] = useState(0);
  const [failed, setFailed] = useState(false);
  const [alt, setAlt] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !io) return;
    el.__vis = (v) => { setVisible(v); if (v) setSeen(true); };
    io.observe(el);
    return () => { io.unobserve(el); el.__vis = null; };
  }, []);

  const twoFrames = media.kind === 'frames' && media.frames.length > 1;
  useEffect(() => {
    if (!twoFrames || !visible || reduceMotion || loaded < 2) return;
    const t = setInterval(() => setAlt((a) => !a), interval);
    return () => clearInterval(t);
  }, [twoFrames, visible, loaded]);

  useEffect(() => {
    const v = vref.current;
    if (!v) return;
    if (visible) v.play().catch(() => {}); else v.pause();
  }, [visible, seen]);

  const onLoad = () => setLoaded((n) => n + 1);
  const onError = () => setFailed(true);
  const cls = `anim ${alt ? 'alt' : ''} ${loaded || failed ? 'ready' : ''} ${className}`;

  let body = null;
  if (failed || !media.frames.length) {
    body = html`<div style="position:absolute;inset:0;display:grid;place-items:center;color:var(--faint)"><${Icon} name="image" size="32" /></div>`;
  } else if (seen && media.kind === 'video') {
    body = html`<video ref=${vref} class="f0" src=${media.frames[0]} muted loop playsinline autoplay preload="metadata"
      onLoadedData=${onLoad} onError=${onError}></video>`;
  } else if (seen) {
    body = media.frames.map((src, i) => html`<img class=${'f' + i} src=${src} alt=${i === 0 ? ex.nameEs : ''}
      decoding="async" draggable="false" onLoad=${onLoad} onError=${onError} />`);
  }
  return html`<div ref=${ref} class=${cls}>${body}</div>`;
}

// ---------- Barra superior ----------
export function Topbar({ title, sub, eyebrow, back, backTo = '/', onBack, actions }) {
  return html`<header class="topbar"><div class="page"><div class="topbar-in">
    ${back && html`<button class="icon-btn" aria-label="Regresar" onClick=${() => (onBack ? onBack() : goBack(backTo))}><${Icon} name="back" /></button>`}
    <div style="flex:1;min-width:0">
      ${eyebrow && html`<div class="eyebrow">${eyebrow}</div>`}
      <h1>${title}</h1>
      ${sub && html`<div class="sub">${sub}</div>`}
    </div>
    ${actions}
  </div></div></header>`;
}

// ---------- Hoja inferior (modal) ----------
export function Sheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open]);
  if (!open) return null;
  return html`<div>
    <div class="backdrop" onClick=${onClose}></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label=${title}>
      <div class="sheet-grip"></div>
      ${title && html`<h3>${title}</h3>`}
      ${children}
    </div>
  </div>`;
}

// ---------- Avisos ----------
export function Toast() {
  const t = useStore((s) => s.toast);
  if (!t) return null;
  return html`<div class=${`toast ${t.kind === 'bad' ? 'bad' : ''}`} role="status">${t.text}</div>`;
}

export function OfflineBanner() {
  const online = useStore((s) => s.online);
  if (online) return null;
  return html`<div class="banner"><${Icon} name="offline" />Sin conexión. Lo que hagas se guarda y se sincroniza al volver la señal.</div>`;
}

export function Spinner() {
  return html`<div class="center mt-lg" style="display:grid;place-items:center"><div class="spinner"></div></div>`;
}

export const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '·';
