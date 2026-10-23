// Exportar la rutina a PDF "Historia" 9:16 (estilo PUSH HARDER) en el navegador.
// pdfmake se descarga solo la primera vez que exportas (≈1.4 MB, luego queda en caché).
import { buildDoc, FONT_FILES } from './layout.js';

const PDFMAKE_URL = 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.20/build/pdfmake.min.js';
const FONT_DIR = 'fonts/pdf/';
const BG = '#1F2327';

let pdfMakePromise;
function loadPdfMake() {
  if (window.pdfMake?.createPdf) return Promise.resolve(window.pdfMake);
  if (!pdfMakePromise) {
    pdfMakePromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PDFMAKE_URL;
      s.async = true;
      s.onload = () => (window.pdfMake?.createPdf ? resolve(window.pdfMake) : reject(new Error('pdfmake no cargó')));
      s.onerror = () => { pdfMakePromise = null; reject(new Error('No se pudo descargar el generador de PDF. Revisa tu conexión.')); };
      document.head.appendChild(s);
    });
  }
  return pdfMakePromise;
}

const toBase64 = (buf) => {
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

let fontsPromise;
function loadFonts() {
  if (!fontsPromise) {
    const files = [...new Set(Object.values(FONT_FILES).flatMap((f) => Object.values(f)))];
    fontsPromise = Promise.all(files.map(async (f) => {
      const res = await fetch(FONT_DIR + f);
      if (!res.ok) throw new Error(`Falta la fuente ${f}`);
      return [f, toBase64(await res.arrayBuffer())];
    })).then((pairs) => Object.fromEntries(pairs)).catch((e) => { fontsPromise = null; throw e; });
  }
  return fontsPromise;
}

// ---------- Miniaturas (cuadro fijo del ejercicio, con esquinas redondeadas) ----------
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
function loadVideoFrame(src) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.onloadeddata = () => { v.currentTime = Math.min(0.2, (v.duration || 1) / 4); };
    v.onseeked = () => resolve(v);
    v.onerror = reject;
    v.src = src;
  });
}

async function thumbnail(ex) {
  const W = 360; const H = 240; const R = 18;
  let src;
  let isVideo = false;
  if (ex.src === 'custom') {
    src = ex.media?.src;
    isVideo = /\.(mp4|webm|mov)(\?|#|$)/i.test(src || '');
  } else {
    src = `media/ex/${ex.id}/0.webp`;
  }
  if (!src) return null;
  try {
    const el = isVideo ? await loadVideoFrame(src) : await loadImage(src);
    const sw = el.videoWidth || el.naturalWidth; const sh = el.videoHeight || el.naturalHeight;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = BG; g.fillRect(0, 0, W, H);
    g.save();
    g.beginPath();
    if (g.roundRect) g.roundRect(0, 0, W, H, R); else g.rect(0, 0, W, H);
    g.clip();
    // "cover": recorta al centro manteniendo 3:2
    const scale = Math.max(W / sw, H / sh);
    const dw = sw * scale; const dh = sh * scale;
    g.drawImage(el, (W - dw) / 2, (H - dh) / 2, dw, dh);
    g.restore();
    return c.toDataURL('image/jpeg', 0.8); // falla si la URL externa no permite CORS
  } catch {
    return null;
  }
}

/** URL pública de la ficha de un ejercicio (la que abre el QR). */
export function publicExerciseBase() {
  const path = location.pathname.replace(/index\.html$/, '');
  return `${location.origin}${path}#/ej/`;
}
export const isLocalHost = () => ['localhost', '127.0.0.1', ''].includes(location.hostname);

export function pdfFileName(routine, studentName) {
  const clean = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const first = clean((studentName || '').split(' ')[0]);
  const name = clean(routine.name) || 'Semanal';
  return `${/^rutina/i.test(name) ? '' : 'Rutina_'}${name}${first ? `_${first}` : ''}_Historia.pdf`;
}

/**
 * Genera el PDF y devuelve { blob, fileName }.
 * @param {(msg:string)=>void} [onStep] avisa el avance para la interfaz
 */
export async function exportRoutinePdf({ routine, studentName, exIndex, catalog, accent, withThumbs = true, withQr = true, onStep = () => {} }) {
  onStep('Cargando el generador…');
  const [pdfMake, vfs] = await Promise.all([loadPdfMake(), loadFonts()]);

  const thumbs = new Map();
  if (withThumbs) {
    const ids = [...new Set(routine.days.flatMap((d) => d.slots.map((s) => s.exId)))];
    let done = 0;
    await Promise.all(ids.map(async (id) => {
      const ex = exIndex.get(id);
      if (ex) { const t = await thumbnail(ex); if (t) thumbs.set(id, t); }
      done += 1;
      onStep(`Preparando miniaturas ${done}/${ids.length}…`);
    }));
  }

  onStep('Armando el PDF…');
  const doc = buildDoc({
    routine, studentName, exIndex, catalog, thumbs, accent,
    qrBase: withQr ? publicExerciseBase() : null,
  });
  const fonts = Object.fromEntries(Object.entries(FONT_FILES).map(([fam, v]) => [fam, { ...v }]));
  const blob = await new Promise((resolve, reject) => {
    try { pdfMake.createPdf(doc, null, fonts, vfs).getBlob(resolve); } catch (e) { reject(e); }
  });
  return { blob, fileName: pdfFileName(routine, studentName) };
}

/** Comparte (WhatsApp, etc.) si el dispositivo lo permite; si no, descarga. */
export async function deliverPdf({ blob, fileName }, mode = 'auto') {
  const file = new File([blob], fileName, { type: 'application/pdf' });
  if (mode !== 'download' && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: fileName }); return 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'downloaded';
}
