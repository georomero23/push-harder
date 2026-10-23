// Catálogo: ejercicios base (data/catalog.json, en el repo) + propios (Firestore).
// Etiquetas en español, búsqueda sin acentos y rutas de medios.

export const MUSCLES = {
  chest: 'Pecho', lats: 'Dorsal', 'middle back': 'Espalda media', 'lower back': 'Lumbar',
  traps: 'Trapecio', shoulders: 'Hombro', neck: 'Cuello', biceps: 'Bíceps', triceps: 'Tríceps',
  forearms: 'Antebrazo', quadriceps: 'Cuádriceps', hamstrings: 'Femoral', glutes: 'Glúteo',
  calves: 'Pantorrilla', abdominals: 'Abdomen', adductors: 'Aductores', abductors: 'Abductores',
};

export const MUSCLE_GROUPS = [
  { id: 'pecho', label: 'Pecho', muscles: ['chest'] },
  { id: 'espalda', label: 'Espalda', muscles: ['lats', 'middle back', 'lower back', 'traps'] },
  { id: 'hombro', label: 'Hombro', muscles: ['shoulders', 'neck'] },
  { id: 'biceps', label: 'Bíceps', muscles: ['biceps'] },
  { id: 'triceps', label: 'Tríceps', muscles: ['triceps'] },
  { id: 'cuadriceps', label: 'Cuádriceps', muscles: ['quadriceps'] },
  { id: 'femoral', label: 'Femoral', muscles: ['hamstrings'] },
  { id: 'gluteo', label: 'Glúteo', muscles: ['glutes', 'abductors'] },
  { id: 'aductor', label: 'Aductor', muscles: ['adductors'] },
  { id: 'pantorrilla', label: 'Pantorrilla', muscles: ['calves'] },
  { id: 'abdomen', label: 'Abdomen', muscles: ['abdominals'] },
  { id: 'antebrazo', label: 'Antebrazo', muscles: ['forearms'] },
];

export const EQUIPMENT = {
  barra: 'Barra', mancuerna: 'Mancuernas', polea: 'Polea', maquina: 'Máquina', smith: 'Smith',
  peso_corporal: 'Peso corporal', pesa_rusa: 'Pesa rusa', ligas: 'Ligas', barra_z: 'Barra Z', otro: 'Otro',
};

export const PATTERNS = {
  press_horizontal: 'Press horizontal', press_inclinado: 'Press inclinado', press_declinado_fondos: 'Declinado y fondos',
  aperturas_pecho: 'Aperturas de pecho', press_vertical: 'Press vertical', elevacion_lateral: 'Elevación lateral',
  elevacion_frontal: 'Elevación frontal', deltoide_posterior: 'Deltoide posterior', encogimientos: 'Trapecio',
  jalon_vertical: 'Jalón vertical', remo: 'Remo', pullover: 'Pullover', bisagra_cadera: 'Bisagra de cadera',
  extension_lumbar: 'Extensión lumbar', sentadilla: 'Sentadilla', zancada_unilateral: 'Unilateral de pierna',
  extension_rodilla: 'Extensión de rodilla', flexion_rodilla: 'Flexión de rodilla', empuje_cadera: 'Empuje de cadera',
  abduccion_cadera: 'Abducción de cadera', aduccion_cadera: 'Aducción de cadera', patada_gluteo: 'Patada de glúteo',
  pantorrilla: 'Pantorrilla', curl_biceps: 'Curl de bíceps', curl_martillo: 'Curl martillo',
  extension_triceps: 'Extensión de tríceps', press_cerrado_triceps: 'Press cerrado', antebrazo: 'Antebrazo',
  core_flexion: 'Flexión de tronco', core_antiextension: 'Antiextensión', core_rotacion: 'Rotación y oblicuos',
  elevacion_piernas: 'Elevación de piernas', otro: 'Otro',
};

export const REGIONS = { superior: 'Tren superior', inferior: 'Tren inferior', core: 'Core' };
export const MECHANICS = { compuesto: 'Compuesto', aislamiento: 'Aislamiento' };
export const LEVELS = { beginner: 'Principiante', intermediate: 'Intermedio', expert: 'Avanzado' };

// Región sugerida por patrón (el formulario de ejercicios propios la propone sola).
export const REGION_BY_PATTERN = (p) => {
  if (['bisagra_cadera', 'sentadilla', 'zancada_unilateral', 'extension_rodilla', 'flexion_rodilla', 'empuje_cadera',
    'abduccion_cadera', 'aduccion_cadera', 'patada_gluteo', 'pantorrilla'].includes(p)) return 'inferior';
  if (p.startsWith('core_') || p === 'elevacion_piernas') return 'core';
  return 'superior';
};

export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export async function loadBaseCatalog() {
  const res = await fetch('data/catalog.json');
  if (!res.ok) throw new Error('No se pudo cargar el catálogo');
  const data = await res.json();
  return data.exercises.map((e) => ({ ...e, src: 'base' }));
}

/** Índice de búsqueda: nombre, alias, músculos, equipo y patrón, sin acentos. */
function haystack(ex) {
  if (!ex._hay) {
    ex._hay = norm([
      ex.nameEs, ...(ex.aliases || []),
      ...(ex.primary || []).map((m) => MUSCLES[m]), ...(ex.secondary || []).map((m) => MUSCLES[m]),
      EQUIPMENT[ex.equipment], PATTERNS[ex.pattern],
    ].join(' '));
  }
  return ex._hay;
}

export function filterExercises(list, { q = '', group = 'all', equipment = 'all' } = {}) {
  const terms = norm(q).split(/\s+/).filter(Boolean);
  const g = MUSCLE_GROUPS.find((x) => x.id === group);
  return list.filter((ex) => {
    if (g && !(ex.primary || []).some((m) => g.muscles.includes(m))) return false;
    if (equipment !== 'all' && ex.equipment !== equipment) return false;
    if (terms.length) {
      const h = haystack(ex);
      return terms.every((t) => h.includes(t));
    }
    return true;
  });
}

/** Con búsqueda: primero los que empiezan con lo escrito, luego los que lo contienen en el nombre. */
export function rankExercises(list, q) {
  const t = norm(q).trim();
  if (!t) return list;
  const terms = t.split(/\s+/);
  const score = (ex) => {
    const n = norm(ex.nameEs);
    if (n.startsWith(t)) return 0;
    if (n.includes(t)) return 1;
    if (terms.every((w) => n.includes(w))) return 2;
    return 3;
  };
  return list.map((ex) => [score(ex), ex]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}

export function sortExercises(list) {
  return [...list].sort((a, b) => a.nameEs.localeCompare(b.nameEs, 'es'));
}

/** Variantes del mismo patrón (para la regla 4 y para el detalle). */
export function variantsOf(ex, all, limit = 12) {
  return all
    .filter((o) => o.id !== ex.id && o.pattern === ex.pattern && ex.pattern !== 'otro')
    .sort((a, b) => (a.equipment === ex.equipment) - (b.equipment === ex.equipment) || a.nameEs.localeCompare(b.nameEs, 'es'))
    .slice(0, limit);
}

/** Rutas de medios. Base: 2 cuadros WebP. Propios: GIF/WebP/MP4 en media/custom/ o URL. */
export function mediaOf(ex, size = 'full') {
  if (ex.src === 'custom') {
    const url = ex.media?.src || '';
    const isVideo = /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
    return { kind: isVideo ? 'video' : 'img', frames: url ? [url] : [] };
  }
  const base = `media/ex/${ex.id}/`;
  const n = ex.frames || 2;
  const names = size === 'thumb' ? ['t0', 't1'] : ['0', '1'];
  return { kind: 'frames', frames: names.slice(0, n).map((f) => `${base}${f}.webp`) };
}

export const muscleLabel = (m) => MUSCLES[m] || m;
export const primaryLabel = (ex) => (ex.primary || []).map(muscleLabel).join(' · ');

export const slugify = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
