// Convierte lo leído del PDF en una rutina de la app (días → slots), con su ejercicio del catálogo.
// Cada slot lleva `_import` (nombre original, confianza, opciones) para la pantalla de revisión;
// se quita antes de guardar con `cleanDraft`.

import { matchExercise, buildIndex, hasMovement, normName } from './match.js';
import { TECHNIQUES } from '../lib/routine.js';

const rid = (p) => `${p}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
const SS = ['A', 'B', 'C', 'D'];

/** "Elevaciones laterales + extensión en polea con cuerda" → ["Elevaciones laterales", "extensión en polea con cuerda"] */
function splitPair(name) {
  const parts = name.split(/\s+\+\s+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  // "Press francés barra + unilateral mancuerna": la segunda parte hereda el movimiento de la primera.
  if (!hasMovement(parts[1])) parts[1] = `${parts[0].split(' ').slice(0, 2).join(' ')} ${parts[1]}`;
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1));
}

/** "Aperturas en polea o pec-deck" → principal "Aperturas en polea", alternativa "pec-deck". */
function splitOr(name) {
  const m = name.match(/^(.+?)\s+o\s+(.+)$/);
  if (!m || !hasMovement(m[1])) return { main: name, alt: '' };
  return { main: m[1].trim(), alt: m[2].trim() };
}

const tidyName = (s) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

function noteFor(block, part) {
  const out = [];
  if (block.tech?.label) out.push(block.tech.label);
  if (part?.fallo) out.push('Al fallo');
  if (part?.unit) out.push(part.unit === 'min' ? 'Por tiempo (minutos)' : 'Por tiempo (segundos)');
  const text = block.notes.join(' ').replace(/\s+/g, ' ').trim();
  return [out.join(' · '), text].filter(Boolean).join('. ').slice(0, 400);
}

function repsOf(part) {
  if (!part) return { repMin: 8, repMax: 12 };
  if (part.unit === 'min') return { repMin: part.min * 60, repMax: part.max * 60 };
  return { repMin: part.min, repMax: Math.max(part.min, part.max) };
}

/**
 * @param {ReturnType<import('./parse.js').parseRoutine>} parsed
 * @param {Object[]} catalog base + propios
 * @param {Object<string,string>} [learned]
 */
export function toDraft(parsed, catalog, learned = {}) {
  const index = buildIndex(catalog);
  const days = parsed.days.map((d) => {
    let ss = 0;
    const slots = [];
    for (const b of d.blocks) {
      const pair = b.sets.parts.length === 2 ? splitPair(b.name) : null;
      const names = pair || [b.name];
      const group = pair ? SS[ss++ % SS.length] : null;
      names.forEach((n, i) => {
        // "Hip-Thrust · bloque pesado": lo que va después del punto medio es una aclaración.
        const [first, ...qual] = n.split(/\s+·\s+/);
        const { main, alt: orAlt } = splitOr(first);
        const m = matchExercise(main, index, learned, b.group);
        const part = b.sets.parts[pair ? i : 0];
        let tech = b.tech?.type || 'none';
        let extra = '';
        if (pair) { if (tech === 'drop') extra = 'Drop mecánico'; tech = 'superset'; }
        const applyTo = /\btodas\b/i.test(b.notes.join(' ')) && !['superset', 'fst7', 'none'].includes(tech) ? 'all' : 'last';
        const compound = m.ex?.mechanic === 'compuesto';
        const notes = [qual.join(' · '), extra, noteFor(b, part)].filter(Boolean).join('. ');
        slots.push({
          id: rid('s'),
          exId: m.ex?.id || null,
          src: m.ex?.src || 'base',
          // Se respeta el nombre que escribió el entrenador; el catálogo pone la animación y los músculos.
          exName: tidyName(main),
          sets: b.sets.sets,
          ...repsOf(part),
          restSec: b.rest || (compound ? 120 : 60),
          rir: b.rir ?? 2,
          technique: { type: TECHNIQUES[tech] ? tech : 'none', applyTo, detail: '' },
          ssGroup: group,
          incrementKg: null,
          notes,
          ...(b.alt || orAlt ? { alt: (b.alt || orAlt).slice(0, 90) } : {}),
          _import: {
            srcName: n,
            key: normName(main),
            level: m.ex ? m.level : 'baja',
            score: m.score,
            options: m.options.map((e) => e.id),
          },
        });
      });
    }
    return { id: rid('d'), name: d.name, focus: d.focus || '', notes: (d.notes || '').trim().slice(0, 600), slots };
  });
  return { name: parsed.name, goal: parsed.goal || '', notes: parsed.notes || '', days, warnings: parsed.warnings };
}

/** Quita lo que solo sirve para revisar. Falla si queda un ejercicio sin elegir. */
export function cleanDraft(draft) {
  const missing = draft.days.flatMap((d) => d.slots.filter((s) => !s.exId).map((s) => `${d.name}: ${s._import?.srcName || s.exName}`));
  if (missing.length) throw new Error(`Elige el ejercicio de: ${missing.join(', ')}`);
  return {
    name: draft.name.trim() || 'Rutina importada',
    goal: (draft.goal || '').trim(),
    notes: (draft.notes || '').trim(),
    days: draft.days.map((d) => ({
      id: d.id, name: d.name, focus: d.focus, notes: d.notes,
      slots: d.slots.map(({ _import, ...s }) => s),
    })),
  };
}

/**
 * Correcciones del entrenador para reconocerlas solas la próxima vez
 * ("remo en t con apoyo de pecho" → exId). Solo lo que cambió o confirmó a mano.
 */
export function learnedFrom(draft) {
  const out = {};
  for (const d of draft.days) {
    for (const s of d.slots) {
      const imp = s._import;
      if (!imp || !s.exId || !(imp.changed || imp.confirmed)) continue;
      const key = imp.key || normName(imp.srcName);
      if (key && key.length <= 120) out[key] = s.exId;
    }
  }
  return out;
}

/** Ejercicios que conviene que el entrenador mire (confianza media/baja o sin elegir). */
export const needsReview = (slot) => !slot.exId || (slot._import && slot._import.level !== 'alta' && !slot._import.changed && !slot._import.confirmed);
