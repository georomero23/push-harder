// Empareja nombres de ejercicio escritos a mano ("Remo en T con apoyo de pecho") con el catálogo.
// Puro y sin dependencias: se prueba en Node.

import { strip } from './parse.js';

const STOP = new Set(['de', 'del', 'la', 'el', 'en', 'con', 'a', 'al', 'y', 'o', 'para', 'los', 'las', 'por', 'un', 'una', 'u', 'tu', 'hacia', 'sobre', 'e']);

// Frases del gym en México → como se llaman en el catálogo. Se aplican antes de separar palabras.
const PHRASES = [
  [/\breverse pec[\s-]?deck\b|\bpec[\s-]?deck (invertido|inverso|reverso)\b/g, 'pec deck invertido'],
  [/\bpec[\s-]?deck\b/g, 'pec deck'],
  [/\bhip[\s-]?thrusts?\b/g, 'hip thrust'],
  [/\bstep[\s-]?ups?\b/g, 'subidas al cajon'],
  [/\brdl\b/g, 'peso muerto rumano'],
  [/\bextension femoral( acostad[ao])?\b/g, 'curl femoral acostado'],
  [/\bfemoral acostad[ao]\b/g, 'curl femoral acostado'],
  [/\b(elevacion|elevaciones) (de )?(talon|talones|pantorrilla|pantorrillas)\b/g, 'pantorrilla'],
  [/\belevacion en maquina sentad[ao]\b/g, 'pantorrilla sentado en maquina'],
  [/\babductor(es)?\b/g, 'abductores abduccion'],
  [/\baductor(es)?\b/g, 'aductores aduccion'],
  [/\babduccion de cadera\b/g, 'abductores abduccion cadera'],
  [/\bspider\b/g, 'arana'],
  [/\bjalon (al pecho )?neutro\b/g, 'jalon al pecho agarre neutro triangulo'],
  [/\bremo gironda\b/g, 'remo sentado en polea'],
  [/\bgironda\b/g, 'remo sentado en polea'],
  [/\bfondos( en paralelas)?$/g, 'fondos en paralelas para pecho'],
  [/\bplancha frontal\b/g, 'plancha'],
  [/\bcrunch en polea arrodillad[ao]\b|\bcrunch en polea \(arrodillad[ao]\)/g, 'crunch en polea'],
  [/\bextension sobre la cabeza\b/g, 'extension tras nuca'],
  [/\bextension (en polea )?(con )?cuerda\b/g, 'jalon de triceps con cuerda'],
  [/\bextension en polea\b/g, 'jalon de triceps en polea'],
  // Sin lookbehind (Safari viejito no lo soporta): si ya dice "elevaciones", se deja igual.
  [/(\belevaci(?:on|ones) )?\blaterales\b/g, (m, pre) => (pre ? m : 'elevaciones laterales')],
  [/(\belevaci(?:on|ones) )?\bfrontales\b/g, (m, pre) => (pre ? m : 'elevaciones frontales')],
  [/\bpajaros?\b/g, 'pajaros'],
  [/\bpress militar con mancuernas\b|\bpress militar sentad[ao] con mancuernas\b/g, 'press de hombro sentado con mancuernas'],
  [/\bpress horizontal\b/g, 'press plano'],
  [/\bsentadilla libre\b/g, 'sentadilla con barra'],
  [/\bjalon unilateral\b/g, 'jalon a una mano unilateral'],
  [/\bremo unilateral\b/g, 'remo con mancuerna a una mano'],
  [/\bcurl de biceps\b(?= \w)/g, 'curl'],
  [/\bcriss cross\b/g, 'tijeras'],
  [/\bbicicleta abdominal\b/g, 'abdominal bicicleta'],
  [/\bpullover en polea\b/g, 'pullover en polea'],
  [/\bapoyo de pecho\b|\bpecho apoyado\b|\bcon apoyo\b/g, 'pecho apoyado'],
  [/\bmultipower\b/g, 'smith'],
  [/,?\s*de (abajo hacia arriba|arriba hacia abajo)\b/g, ''],
  [/\baperturas en polea baja\b/g, 'cruces en polea baja'],
  [/\bzancadas?\b/g, 'desplante'],
  [/\binversa\b/g, 'hacia atras'],
  [/\bprensa con pies (altos|bajos|abiertos)\b/g, 'prensa'],
  [/\belevacion de pie\b/g, 'pantorrilla de pie'],
  [/\belevacion sentad[ao]\b/g, 'pantorrilla sentado'],
  [/\bmaquina convergente\b/g, 'maquina'],
];

// Palabras que definen el movimiento pesan más que el equipo o los detalles.
const CORE = new Set(['curl', 'press', 'remo', 'jalon', 'sentadilla', 'elevacion', 'extension', 'apertura', 'cruce', 'fondo', 'dominada',
  'pullover', 'prensa', 'desplante', 'zancada', 'hip', 'thrust', 'peso', 'muerto', 'rumano', 'pantorrilla', 'crunch', 'plancha', 'face',
  'pull', 'pec', 'deck', 'abductore', 'aductore', 'abduccion', 'aduccion', 'femoral', 'cuadricep', 'hack', 'goblet', 'bulgara', 'patada',
  'puente', 'hiperextension', 'encogimiento', 'lagartija', 'militar', 'lateral', 'frontal', 'martillo', 'predicador', 'arana', 'pajaro',
  'triceps', 'frances', 'nuca', 'rueda', 'bicicleta', 'subida', 'cajon', 'sumo', 'smith', 'inclinado', 'declinado', 'plano', 'hombro']);

// Equipo escrito en el PDF → equipo del catálogo. Si no coincide, baja la confianza.
const EQUIP = {
  mancuern: ['mancuerna'], barr: ['barra', 'barra_z', 'smith'], pole: ['polea'], cuerd: ['polea'], maquin: ['maquina', 'smith'],
  smith: ['smith'], lig: ['ligas'], kettlebell: ['pesa_rusa'], rus: ['pesa_rusa'],
};
// Palabras que cambian el ejercicio: si el candidato las trae y el PDF no, casi seguro es otro.
const DISCRIMINATE_WORDS = ['femoral', 'menton', 'junto', 'muneca', 'cuello', 'triceps', 'inverso', 'declinado', 'frontal', 'lateral',
  'hincado', 'burro', 'escapulares', 'asistidas', 'lastre', 'salto', 'hexagonal', 'deficit', 'sumo', 'zottman', 'arrastre', 'scott'];
// Nombres genéricos → la versión más común en un gym.
const DEFAULTS = {
  sentadilla: 'Sentadilla con barra',
  pantorrilla: 'Pantorrilla de pie en máquina',
  'remo con mancuerna': 'Remo con mancuerna a una mano',
  'curl de biceps': 'Curl con mancuernas',
  'press militar': 'Press militar de pie con barra',
  'hip thrust': 'Hip thrust con barra',
  'peso muerto rumano': 'Peso muerto rumano con barra',
  'elevaciones laterales': 'Elevaciones laterales con mancuernas',
  dominadas: 'Dominadas',
  'press inclinado': 'Press inclinado con mancuernas',
  'press plano': 'Press plano con mancuernas',
};

/** Palabra → raíz simple (plurales y género). */
export function stem(w) {
  let s = w;
  if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  if (s.length > 5 && /[^aeiou]e$/.test(s) && /(on|al|or|ar|ec|ul)e$/.test(s)) s = s.slice(0, -1);
  if (s.length > 4 && /[ao]$/.test(s)) s = s.slice(0, -1);
  return s;
}

export function normName(name) {
  let t = strip(name).toLowerCase()
    .replace(/[·•|]/g, ' ')
    .replace(/[-–—_/]/g, ' ')
    .replace(/[^a-z0-9() ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [re, rep] of PHRASES) t = t.replace(re, rep);
  return t.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** ¿El nombre trae un movimiento ("press", "curl", "remo"…) o solo equipo/detalles? */
export const hasMovement = (name) => tokens(name).some((t) => weight(t) === 2);

export function tokens(name) {
  return [...new Set(normName(name).split(' ').filter((w) => w && !STOP.has(w)).map(stem))];
}

const DISCRIMINATE = new Set(DISCRIMINATE_WORDS.map(stem));
const weight = (t) => (CORE.has(t) || CORE.has(`${t}e`) || CORE.has(`${t}a`) || CORE.has(`${t}o`) ? 2 : 1);

function score(q, c, hint = []) {
  if (!q.length || !c.length) return 0;
  const cs = new Set(c);
  const qs = new Set(q);
  let common = 0; let wq = 0; let wc = 0;
  for (const t of q) { const w = weight(t); wq += w; if (cs.has(t)) common += w; }
  for (const t of c) wc += weight(t);
  // Pista del grupo ("PANTORRILLA", "GLÚTEO") que viene arriba del ejercicio en el PDF.
  for (const t of hint) if (cs.has(t) && !qs.has(t)) { const w = weight(t); common += w; wq += w; }
  if (!common) return 0;
  // F-beta (β = 1.5): pesa más encontrar lo que escribió el entrenador que lo que le sobra al catálogo.
  const P = Math.min(1, common / wc); const R = Math.min(1, common / wq); const b2 = 2.25;
  let f = ((1 + b2) * P * R) / (b2 * P + R);
  for (const t of c) if (DISCRIMINATE.has(t) && !qs.has(t)) f *= 0.7;
  return f;
}

/**
 * Índice para emparejar rápido.
 * @param {Object[]} catalog ejercicios (base + propios) con nameEs y aliases
 */
export function buildIndex(catalog) {
  return catalog.map((e) => ({
    ex: e,
    keys: [e.nameEs, ...(e.aliases || [])].filter(Boolean).map((n) => ({ n, t: tokens(n) })),
  }));
}

/**
 * @param {string} name nombre escrito en el PDF
 * @param {ReturnType<typeof buildIndex>} index
 * @param {Object<string,string>} [learned] normName → exId (correcciones previas del entrenador)
 * @returns {{ ex: Object|null, score: number, level: 'alta'|'media'|'baja', options: Object[] }}
 */
export function matchExercise(name, index, learned = {}, group = '') {
  const key = normName(name);
  const learnedId = learned[key] || learned[name];
  if (learnedId) {
    const hit = index.find((x) => x.ex.id === learnedId);
    if (hit) return { ex: hit.ex, score: 1, level: 'alta', options: [hit.ex], learned: true };
  }
  const def = DEFAULTS[key] && index.find((x) => x.ex.nameEs === DEFAULTS[key]);
  const q = tokens(name);
  const hint = group ? tokens(group) : [];
  const ranked = index
    .map((x) => {
      let best = 0;
      for (const k of x.keys) {
        if (normName(k.n) === key) { best = 1.2; break; }
        best = Math.max(best, score(q, k.t, hint));
      }
      // Equipo escrito en el PDF que no coincide con el del ejercicio ("laterales en máquina" ≠ con mancuernas)
      const want = q.flatMap((t) => EQUIP[t] || []);
      if (want.length && x.ex.equipment && !want.includes(x.ex.equipment)) best *= 0.72;
      if (def && x.ex.id === def.ex.id) best = Math.max(best, 0.9);
      return { ex: x.ex, s: best };
    })
    .sort((a, b) => b.s - a.s || a.ex.nameEs.length - b.ex.nameEs.length);
  const top = ranked[0];
  if (!top || top.s < 0.25) return { ex: null, score: 0, level: 'baja', options: ranked.slice(0, 5).map((r) => r.ex) };
  const level = top.s >= 0.8 ? 'alta' : top.s >= 0.55 ? 'media' : 'baja';
  return { ex: top.ex, score: Math.min(1, top.s), level, options: ranked.slice(0, 6).map((r) => r.ex) };
}
