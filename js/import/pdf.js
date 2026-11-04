// Leer un PDF en el navegador con pdf.js (CDN, se carga solo cuando se usa) y convertirlo en rutina.
import { toLines } from './lines.js';
import { parseRoutine } from './parse.js';
import { toDraft } from './draft.js';
import { buildIndex, matchExercise, normName } from './match.js';

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.min.mjs';
const WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.worker.min.mjs';

let lib = null;
async function pdfjs() {
  if (!lib) {
    lib = await import(PDFJS);
    lib.GlobalWorkerOptions.workerSrc = WORKER;
  }
  return lib;
}

/** Texto con posición de cada página. */
export async function readPdf(file, onStep = () => {}) {
  onStep('Abriendo el PDF…');
  const { getDocument } = await pdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await getDocument({ data, isEvalSupported: false }).promise;
  const meta = await doc.getMetadata().catch(() => null);
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    onStep(`Leyendo página ${p} de ${doc.numPages}…`);
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const vp = page.getViewport({ scale: 1 });
    pages.push({ page: p, width: vp.width, height: vp.height, lines: toLines(content, p) });
  }
  doc.destroy();
  return { meta: meta?.info || {}, pages, fileName: file.name };
}

/** Rutina incrustada por PUSH HARDER al exportar (keywords "PHR1:…"). */
export function embeddedRoutine(meta) {
  const k = String(meta?.Keywords || '');
  const i = k.indexOf('PHR1:');
  if (i < 0) return null;
  try {
    const json = decodeURIComponent(escape(atob(k.slice(i + 5).trim())));
    const data = JSON.parse(json);
    return data?.days ? data : null;
  } catch { return null; }
}

const rid = (p) => `${p}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

/** PDF de la app → borrador exacto (si un ejercicio propio no existe en esta cuenta, se busca por nombre). */
export function draftFromEmbedded(data, catalog, learned) {
  const byId = new Map(catalog.map((e) => [e.id, e]));
  const index = buildIndex(catalog);
  return {
    name: data.name || 'Rutina importada', goal: data.goal || '', notes: data.notes || '', exact: true, warnings: [],
    days: data.days.map((d) => ({
      id: rid('d'), name: d.name, focus: d.focus || '', notes: d.notes || '',
      slots: d.slots.map((s) => {
        const ex = byId.get(s.exId);
        const m = ex ? { ex, level: 'alta', score: 1, options: [ex] } : matchExercise(s.exName, index, learned);
        return {
          ...s, id: rid('s'), exId: m.ex?.id || null, src: m.ex?.src || 'base',
          _import: { srcName: s.exName, key: normName(s.exName), level: m.ex ? m.level : 'baja', score: m.score, options: m.options.map((e) => e.id) },
        };
      }),
    })),
  };
}

/**
 * Archivo → borrador de rutina para revisar.
 * @returns {Promise<{draft:Object, kind:'exacto'|'leido'}>}
 */
export async function importPdf(file, catalog, learned = {}, onStep) {
  const doc = await readPdf(file, onStep);
  const emb = embeddedRoutine(doc.meta);
  if (emb) return { draft: draftFromEmbedded(emb, catalog, learned), kind: 'exacto' };
  onStep?.('Reconociendo ejercicios…');
  const parsed = parseRoutine(doc);
  return { draft: toDraft(parsed, catalog, learned), kind: 'leido' };
}
