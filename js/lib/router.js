// Router por hash (#/ruta): GitHub Pages no soporta rutas tipo SPA en el servidor.
import { useState, useEffect, useLayoutEffect } from './deps.js';

export function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path, parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs || '') };
}

const scrollPos = new Map();

export function useRoute() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    let current = parseHash().path;
    const onChange = () => {
      scrollPos.set(current, window.scrollY);
      const next = parseHash();
      current = next.path;
      setRoute(next);
    };
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  // Restaura el scroll al volver (ej. del detalle al catálogo).
  useLayoutEffect(() => {
    const y = scrollPos.get(route.path) || 0;
    requestAnimationFrame(() => window.scrollTo(0, y));
  }, [route.path]);
  return route;
}

// Cuántas navegaciones internas hay en el historial (para saber si "atrás" sale de la app).
let depth = 0;
let replacing = false;
addEventListener('hashchange', () => { if (replacing) { replacing = false; return; } depth++; });

export const go = (path) => { location.hash = path; };
/** Cambia de ruta sin dejar la anterior en el historial (ej. "nueva" → id real). */
export const replace = (path) => { replacing = true; location.replace(`#${path}`); };
export const back = (fallback = '/') => {
  if (depth > 0) { depth -= 2; history.back(); } else go(fallback);
};
