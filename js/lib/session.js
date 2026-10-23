// Sesión de entrenamiento: 1 documento con todas las series.
import { localDate, isoWeek } from './routine.js';
import { deloadPrescription, sessionTarget, workKg } from '../engine/progression.js';

/** ¿Hay semana de descarga vigente hoy? */
export function deloadActive(progress, today = localDate()) {
  const d = progress?.deload;
  return !!(d?.active && d.from <= today && today <= d.until);
}

/** Arma una sesión nueva a partir del día de la rutina y la carga vigente de cada ejercicio. */
export function buildSession({ routine, day, progress, profile }) {
  const deload = deloadActive(progress);
  return {
    deload,
    studentId: profile.id,
    trainerId: profile.trainerId,
    routineId: routine.id,
    routineVersion: routine.version || 1,
    routineName: routine.name,
    dayId: day.id,
    dayName: day.name,
    date: localDate(),
    week: isoWeek(),
    startedAtMs: Date.now(),
    status: 'open',
    current: 0,
    entries: day.slots.map((orig) => {
      const slot = deload ? deloadPrescription(orig) : orig;
      return {
        slotId: slot.id,
        exId: slot.exId,
        exName: slot.exName,
        prescribed: {
          sets: slot.sets, repMin: slot.repMin, repMax: slot.repMax, rir: slot.rir, restSec: slot.restSec,
          technique: slot.technique || { type: 'none' }, ssGroup: slot.ssGroup || null, notes: slot.notes || '',
          incrementKg: slot.incrementKg ?? null,
          loadKg: progress?.loads?.[slot.id]?.loadKg ?? null,
          repTarget: progress?.loads?.[slot.id]?.repTarget ?? null,
        },
        sets: Array.from({ length: slot.sets }, () => ({ kg: null, reps: null, rir: null, done: false })),
        pain: null,
        note: '',
      };
    }),
  };
}

/** Prescripción de una entrada como "slot" para el motor. */
export const slotFromEntry = (e) => ({ id: e.slotId, exId: e.exId, ...e.prescribed });

/** R2 · Meta de la sesión para una entrada (null en descarga). */
export function entryTarget(session, entry, last) {
  if (session.deload) return null;
  return sessionTarget(slotFromEntry(entry), last, entry.prescribed.loadKg);
}

/** Última actuación registrada para un slot con ese ejercicio (lo que se muestra como "la vez pasada"). */
export const lastPerformance = (progress, slotId, exId) =>
  (progress?.recent?.[slotId] || []).find((p) => !exId || p.exId === exId) || null;

/** Resumen compacto de una entrada para guardar en progress.recent. */
export function recentFromEntry(entry, session) {
  const done = entry.sets.filter((s) => s.done);
  if (!done.length) return null;
  return {
    date: session.date,
    sessionId: session.id,
    exId: entry.exId,
    loadKg: entry.prescribed.loadKg ?? null,
    kg: done.map((s) => s.kg),
    reps: done.map((s) => s.reps),
    rir: done.map((s) => s.rir),
    pain: !!entry.pain,
    deload: !!session.deload,
  };
}

/**
 * Valores sugeridos para una serie: carga vigente (o la de la vez pasada) y reps de la meta
 * de la sesión; si no hay meta, las de la vez pasada; si cambió la carga, el mínimo del rango.
 */
export function setDefaults(entry, i, last, target) {
  const prevSet = entry.sets[i - 1];
  const rx = entry.prescribed;
  const kg = prevSet?.done && prevSet.kg != null ? prevSet.kg
    : rx.loadKg ?? last?.kg?.[i] ?? last?.kg?.[last.kg.length - 1] ?? null;
  const loadChanged = last && rx.loadKg != null && workKg(last) !== rx.loadKg;
  const reps = target?.reps?.[i]
    ?? (loadChanged ? rx.repTarget ?? rx.repMin : null)
    ?? last?.reps?.[i] ?? last?.reps?.[last.reps.length - 1] ?? rx.repMin;
  return { kg, reps, rir: rx.rir };
}

export function sessionStats(session) {
  let setsDone = 0; let setsTotal = 0; let volumeKg = 0;
  for (const e of session.entries || []) {
    for (const s of e.sets) {
      setsTotal++;
      if (s.done) { setsDone++; volumeKg += (Number(s.kg) || 0) * (Number(s.reps) || 0); }
    }
  }
  const end = session.endedAtMs || Date.now();
  return { setsDone, setsTotal, volumeKg: Math.round(volumeKg), minutes: Math.max(1, Math.round((end - session.startedAtMs) / 60000)) };
}

export const fmtKg = (v) => (v == null || v === '' ? '—' : `${Number(v) % 1 ? Number(v).toFixed(1) : Number(v)}`);

/** "60 × 12 · 12 · 11" */
export function fmtPerformance(p) {
  if (!p) return '';
  if (p.kg.every((k) => !k)) return `PC × ${p.reps.join(' · ')}`;
  const sameKg = p.kg.every((k) => k === p.kg[0]);
  if (sameKg) return `${fmtKg(p.kg[0])} kg × ${p.reps.join(' · ')}`;
  return p.kg.map((k, i) => `${fmtKg(k)}×${p.reps[i]}`).join(' · ');
}
