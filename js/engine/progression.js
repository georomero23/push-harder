/**
 * Motor de progresión de PUSH HARDER — módulo puro (sin Firebase, sin DOM).
 *
 * Entra: la prescripción de un ejercicio (slot), su ficha del catálogo y las últimas
 * actuaciones registradas. Sale: propuestas con su motivo. NUNCA aplica cambios: la app
 * guarda cada propuesta como "pendiente" y alguien la acepta o la rechaza.
 *
 * Reglas acordadas con Geo (no agregar otras sin consultarlo):
 *   R1 Doble progresión: todas las series en el tope del rango con RIR ≥ 1 → +incremento y
 *      regresa a la parte baja del rango.
 *   R2 Dentro del rango → mantiene carga y busca +1 rep (meta de sesión, no es propuesta).
 *   R3 Debajo del rango 2 sesiones seguidas → baja 5 % (10 % si promedió 3+ reps abajo).
 *   R4 Estancado 3 sesiones → variante del mismo patrón o semana de descarga.
 *   R5 Molestia → marca el ejercicio, sugiere sustituto y nunca sube carga.
 *   R6 Volumen semanal (series efectivas) por grupo muscular → ver volume.js.
 *
 * Interpretaciones aprobadas:
 *   - "Tope": todas las series prescritas hechas, reps ≥ repMax y RIR ≥ 1 en todas.
 *   - Tope con algún RIR 0 → no sube (R1 exige RIR ≥ 1): mantiene y repite.
 *   - "Debajo": la mitad o más de las series quedaron bajo repMin.
 *   - "Estancado": 3 sesiones seguidas con la misma carga sin superar el total de reps de la primera.
 *   - Las sesiones de semana de descarga no cuentan para el motor.
 *
 * Para conectar una IA después: implementa la misma firma que `evaluateSlot` y pasa sus
 * propuestas por `guard.js` antes de guardarlas. Ver js/engine/README.md.
 */
import { slotIncrement } from './increments.js';

export const ENGINE_VERSION = '1.0.0';

export const RULE_LABELS = {
  R1: 'Doble progresión',
  R2: 'Meta de sesión',
  R3: 'Bajar carga',
  R4: 'Estancamiento',
  R5: 'Molestia',
};

/**
 * @typedef {Object} Performance  Una sesión de un ejercicio (lo que guarda progress.recent).
 * @property {string} date        "YYYY-MM-DD"
 * @property {string} sessionId
 * @property {string} exId
 * @property {number|null} loadKg Carga prescrita ese día
 * @property {number[]} kg        Kg por serie hecha
 * @property {number[]} reps      Reps por serie hecha
 * @property {number[]} rir       RIR por serie hecha
 * @property {boolean} pain       ¿Reportó molestia?
 * @property {boolean} [deload]   ¿Era semana de descarga?
 */

const r1 = (n) => Math.round(n * 10) / 10;
const fmt = (n) => (n == null ? '—' : String(r1(n)).replace(/\.0$/, ''));
const sum = (a) => a.reduce((x, y) => x + (Number(y) || 0), 0);

/** Carga de trabajo de una sesión: la serie más pesada (robusto ante drop sets). */
export function workKg(perf) {
  const ks = (perf?.kg || []).map(Number).filter((k) => Number.isFinite(k));
  return ks.length ? Math.max(...ks) : null;
}

/**
 * Clasifica una actuación contra el rango prescrito.
 * @returns {'top'|'top_rir0'|'in'|'below'|'incomplete'}
 */
export function classify(perf, slot) {
  const reps = perf?.reps || [];
  if (!reps.length) return 'incomplete';
  const n = reps.length;
  const below = reps.filter((r) => r < slot.repMin).length;
  if (below >= Math.ceil(n / 2)) return 'below';
  const allTop = n >= slot.sets && reps.every((r) => r >= slot.repMax);
  if (allTop) return (perf.rir || []).every((x) => Number(x) >= 1) ? 'top' : 'top_rir0';
  return 'in';
}

/** Historial útil para el motor: mismo ejercicio, sin descargas, más reciente primero. */
export function usableHistory(history, exId) {
  return (history || []).filter((p) => p && p.exId === exId && !p.deload && p.reps?.length);
}

/**
 * R2 · Meta de la sesión (se muestra en modo entrenamiento; no cambia la rutina).
 * @returns {{ text: string, reps?: number[], kg?: number|null }|null}
 */
export function sessionTarget(slot, last, currentLoadKg) {
  if (!last) return null;
  const lastKg = workKg(last);
  const kg = currentLoadKg ?? lastKg;
  if (currentLoadKg != null && lastKg != null && currentLoadKg !== lastKg) {
    return { text: `Carga nueva: ${fmt(kg)} kg. Busca ${slot.repMin}+ reps por serie.`, kg, reps: Array(slot.sets).fill(slot.repMin) };
  }
  const cls = classify(last, slot);
  if (cls === 'in') {
    const reps = Array.from({ length: slot.sets }, (_, i) => last.reps[i] ?? last.reps[last.reps.length - 1]);
    const i = reps.findIndex((r) => r < slot.repMax);
    if (i >= 0) reps[i] += 1;
    return { text: `Meta: ${fmt(kg)} kg × ${reps.join(' · ')} (+1 rep)`, kg, reps };
  }
  if (cls === 'top_rir0') return { text: `Repite ${fmt(kg)} kg: llegaste al tope pero con RIR 0.`, kg };
  if (cls === 'below') return { text: `Meta: llegar a ${slot.repMin} reps con ${fmt(kg)} kg.`, kg };
  return null;
}

/**
 * Evalúa un ejercicio después de una sesión.
 * @param {Object} p
 * @param {Object} p.slot           Prescripción: sets, repMin, repMax, rir, incrementKg, id, exId
 * @param {Object} [p.exercise]     Ficha del catálogo (equipment, region, pattern, primary…)
 * @param {Performance[]} p.history Últimas actuaciones, la más reciente primero
 * @param {number|null} p.currentLoadKg Carga vigente (progress.loads)
 * @param {boolean} [p.flagged]     ¿El ejercicio tiene marca de molestia vigente?
 * @param {Object[]} [p.catalog]    Catálogo completo, para variantes y sustitutos
 * @returns {Object[]} Propuestas (0 o 1)
 */
export function evaluateSlot({ slot, exercise, history, currentLoadKg = null, flagged = false, catalog = [] }) {
  const h = usableHistory(history, slot.exId);
  const last = h[0];
  if (!last) return [];
  const load = currentLoadKg ?? workKg(last);
  const base = { slotId: slot.id, exId: slot.exId, engineVersion: ENGINE_VERSION };
  const evidence = (n) => ({ sessionIds: h.slice(0, n).map((x) => x.sessionId), perf: h.slice(0, n).map(({ date, kg, reps, rir }) => ({ date, kg, reps, rir })) });

  // R5 · Molestia en la última sesión → sustituto. Nunca se sube carga.
  if (last.pain) {
    return [{
      ...base, rule: 'R5', kind: 'substitute', scope: 'structure',
      options: substitutesFor(exercise, catalog).map((e) => ({ type: 'variant', exId: e.id, exName: e.nameEs })),
      reason: 'Reportaste molestia → te sugiero un sustituto. No se sube carga mientras siga marcada.',
      evidence: evidence(1),
    }];
  }

  // R1 · Doble progresión.
  const cls = classify(last, slot);
  if (cls === 'top') {
    const inc = slotIncrement(slot, exercise);
    if (flagged || !inc || load == null) return [];
    const to = r1(load + inc);
    return [{
      ...base, rule: 'R1', kind: 'load_up', scope: 'load',
      from: { loadKg: load, repTarget: null }, to: { loadKg: to, repTarget: slot.repMin },
      reason: `Hiciste ${last.reps.join('/')} con RIR ${last.rir.join('·')} → +${fmt(inc)} kg (${fmt(load)} → ${fmt(to)}) y vuelves a ${slot.repMin} reps.`,
      evidence: evidence(1),
    }];
  }

  // R3 · Debajo del rango 2 sesiones seguidas (con la misma carga).
  if (h.length >= 2 && classify(h[0], slot) === 'below' && classify(h[1], slot) === 'below' && workKg(h[0]) === workKg(h[1]) && load) {
    const deficit = (p) => sum(p.reps.map((r) => Math.max(0, slot.repMin - r))) / p.reps.length;
    const avg = (deficit(h[0]) + deficit(h[1])) / 2;
    const pct = avg >= 3 ? 10 : 5;
    const step = slotIncrement(slot, exercise) || 1;
    let to = Math.floor((load * (1 - pct / 100)) / step) * step;
    if (to >= load) to = load - step;
    to = Math.max(0, r1(to));
    const realPct = Math.round(((load - to) / load) * 1000) / 10;
    const stepNote = realPct > 10 ? ` (−${fmt(realPct)} % real: el equipo va de ${fmt(step)} en ${fmt(step)} kg)` : '';
    return [{
      ...base, rule: 'R3', kind: 'load_down', scope: 'load',
      from: { loadKg: load, repTarget: null }, to: { loadKg: to, repTarget: slot.repMin },
      reason: `2 sesiones seguidas debajo de ${slot.repMin} reps (${h[1].reps.join('/')} y ${h[0].reps.join('/')}) → −${pct} %: ${fmt(load)} → ${fmt(to)} kg${stepNote}.`,
      evidence: evidence(2),
    }];
  }

  // R4 · Estancado 3 sesiones: misma carga sin superar el total de reps de la primera.
  if (h.length >= 3) {
    const [a, b, c] = [h[2], h[1], h[0]]; // a = la más antigua
    const sameLoad = workKg(a) === workKg(b) && workKg(b) === workKg(c);
    const ta = sum(a.reps); const tb = sum(b.reps); const tc = sum(c.reps);
    if (sameLoad && tb <= ta && tc <= ta) {
      return [{
        ...base, rule: 'R4', kind: 'plateau', scope: 'structure',
        options: [
          ...variantsFor(exercise, catalog).map((e) => ({ type: 'variant', exId: e.id, exName: e.nameEs })),
          { type: 'deload' },
        ],
        reason: `3 sesiones con ${fmt(workKg(c))} kg sin mejorar (${ta} → ${tb} → ${tc} reps totales) → cambia a una variante del mismo patrón o haz semana de descarga.`,
        evidence: evidence(3),
      }];
    }
  }
  return [];
}

/**
 * Variantes del mismo patrón de movimiento (R4): mismo músculo principal primero; hasta 2 con
 * el mismo equipo (cambio de agarre/ángulo) y al menos 1 con otro equipo, para dar opciones.
 */
export function variantsFor(ex, catalog, n = 3) {
  if (!ex || !ex.pattern || ex.pattern === 'otro') return [];
  const main = ex.primary?.[0];
  const byName = (a, b) => a.nameEs.localeCompare(b.nameEs, 'es');
  const pool = catalog.filter((o) => o.id !== ex.id && o.pattern === ex.pattern)
    .sort((a, b) => (b.primary?.[0] === main) - (a.primary?.[0] === main) || byName(a, b));
  const same = pool.filter((o) => o.equipment === ex.equipment);
  const loadable = (o) => !['peso_corporal', 'ligas', 'otro'].includes(o.equipment);
  const other = pool.filter((o) => o.equipment !== ex.equipment).sort((a, b) => loadable(b) - loadable(a));
  const pick = [...same.slice(0, Math.min(2, n - (other.length ? 1 : 0))), ...other];
  for (const o of same) if (pick.length < n && !pick.includes(o)) pick.push(o);
  return pick.slice(0, n);
}

/** Sustitutos por molestia (R5): mismo músculo principal con otro equipo u otro patrón. */
export function substitutesFor(ex, catalog, n = 3) {
  if (!ex) return [];
  const main = ex.primary?.[0];
  return catalog
    .filter((o) => o.id !== ex.id && o.primary?.[0] === main && (o.equipment !== ex.equipment || o.pattern !== ex.pattern))
    .map((o) => [(o.pattern === ex.pattern ? 0 : 1) + (['maquina', 'polea'].includes(o.equipment) ? 0 : 0.5), o])
    .sort((x, y) => x[0] - y[0] || x[1].nameEs.localeCompare(y[1].nameEs, 'es'))
    .slice(0, n)
    .map((x) => x[1]);
}

/**
 * ¿Ya se decidió una propuesta de la misma regla con la misma evidencia?
 * Evita volver a proponer lo mismo sobre las mismas sesiones después de un "no".
 */
export function alreadyDecided(proposal, decided) {
  const ids = new Set(proposal.evidence?.sessionIds || []);
  return decided.some((d) => d.slotId === proposal.slotId && d.rule === proposal.rule
    && (d.evidence?.sessionIds || []).some((s) => ids.has(s)));
}

/** Semana de descarga: mismos ejercicios y cargas, series a la mitad, RIR +2, sin técnicas. */
export function deloadPrescription(slot) {
  return {
    ...slot,
    sets: Math.ceil(slot.sets / 2),
    rir: Math.min(5, (slot.rir ?? 2) + 2),
    technique: { type: 'none', applyTo: 'last', detail: '' },
  };
}
