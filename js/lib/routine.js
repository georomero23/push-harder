// Modelo de rutina: rutina → días → slots (ejercicio con su prescripción).
// Lo usan el editor, el modo entrenamiento y (más adelante) el motor y el PDF.

export const TECHNIQUES = {
  none: 'Sin técnica',
  drop: 'Drop set',
  restpause: 'Rest-pause',
  eccentric: 'Excéntrica lenta',
  superset: 'Superserie',
  fst7: 'FST-7',
  partials: 'Parciales',
};

export const TECHNIQUE_HINT = {
  drop: 'Al fallo técnico, baja ~20 % la carga y sigue sin descanso.',
  restpause: 'Al terminar, descansa 10–15 s y saca reps extra con la misma carga.',
  eccentric: 'Baja en 3–4 s, controlando todo el recorrido.',
  superset: 'Se alterna con otro ejercicio del mismo grupo (A, B…) sin descanso entre ellos.',
  fst7: 'FST-7 son 7 series de 8–12 con 30–45 s de descanso: suma volumen. Asígnalo solo a propósito.',
  partials: 'Al terminar las reps completas, agrega parciales en el rango más fuerte.',
};

export const SS_GROUPS = ['A', 'B', 'C', 'D'];
export const REST_PRESETS = [45, 60, 90, 120, 150, 180];

export const rid = (prefix = 'x') => `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

export function newDay(index) {
  return { id: rid('d'), name: `Día ${index + 1}`, focus: '', notes: '', slots: [] };
}

export function newSlot(ex) {
  const compound = ex.mechanic === 'compuesto';
  return {
    id: rid('s'),
    exId: ex.id,
    src: ex.src || 'base',
    exName: ex.nameEs,
    sets: 3,
    repMin: compound ? 6 : 10,
    repMax: compound ? 10 : 15,
    restSec: compound ? 120 : 75,
    rir: 2,
    technique: { type: 'none', applyTo: 'last', detail: '' },
    ssGroup: null,
    incrementKg: null,
    notes: '',
  };
}

export function emptyRoutine() {
  return { name: '', goal: '', notes: '', days: [newDay(0)] };
}

/** Copia profunda segura para editar sin tocar el original. */
export const clone = (o) => JSON.parse(JSON.stringify(o ?? null));

export const fmtRest = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min` : `${s} s`);
export const repRange = (slot) => (slot.repMin === slot.repMax ? `${slot.repMin}` : `${slot.repMin}–${slot.repMax}`);

export function techniqueLabel(slot) {
  const t = slot.technique?.type || 'none';
  if (t === 'none') return '';
  if (t === 'superset') return `Superserie ${slot.ssGroup || ''}`.trim();
  const where = t === 'fst7' ? '' : slot.technique.applyTo === 'all' ? ' · todas' : ' · última';
  return `${TECHNIQUES[t]}${where}`;
}

export function slotSummary(slot) {
  return [`${slot.sets} × ${repRange(slot)}`, `RIR ${slot.rir}`, fmtRest(slot.restSec), techniqueLabel(slot)].filter(Boolean).join(' · ');
}

export const countSlots = (r) => (r?.days || []).reduce((n, d) => n + d.slots.length, 0);

/** ¿La técnica aplica a la serie i (0-based)? */
export function techniqueOnSet(slot, i) {
  const t = slot.technique?.type || 'none';
  if (t === 'none' || t === 'superset' || t === 'fst7') return false;
  return slot.technique.applyTo === 'all' || i === slot.sets - 1;
}

/** Aviso (no bloquea): tu regla de técnicas solo en máquina/aislamiento, nunca en compuestos pesados. */
export function techniqueWarning(slot, ex) {
  const t = slot.technique?.type || 'none';
  if (!ex || ['none', 'superset', 'eccentric'].includes(t)) return '';
  const heavy = ex.mechanic === 'compuesto' && ['barra', 'smith', 'barra_z'].includes(ex.equipment);
  if (heavy) return 'Ojo: es un compuesto pesado. Tu regla es usar técnicas solo en máquina o aislamiento.';
  if (slot.technique.applyTo === 'all' && t !== 'fst7') return 'Tu regla es aplicar la técnica solo en la última serie.';
  return '';
}

/** Diferencias legibles entre dos versiones de una rutina (para el historial). */
export function diffRoutines(before, after) {
  const out = [];
  if (!before) return ['Rutina creada'];
  if (before.name !== after.name) out.push(`Nombre: "${before.name}" → "${after.name}"`);
  const bDays = new Map(before.days.map((d) => [d.id, d]));
  const aDays = new Map(after.days.map((d) => [d.id, d]));
  for (const d of after.days) if (!bDays.has(d.id)) out.push(`Día agregado: ${d.name}`);
  for (const d of before.days) if (!aDays.has(d.id)) out.push(`Día eliminado: ${d.name}`);
  const fields = [['sets', 'series'], ['repMin', 'reps mín'], ['repMax', 'reps máx'], ['restSec', 'descanso'], ['rir', 'RIR'], ['incrementKg', 'incremento'], ['ssGroup', 'superserie'], ['notes', 'notas'], ['alt', 'alternativa']];
  for (const d of after.days) {
    const bd = bDays.get(d.id);
    if (!bd) continue;
    if (bd.name !== d.name) out.push(`Día renombrado: ${bd.name} → ${d.name}`);
    if ((bd.notes || '') !== (d.notes || '')) out.push(`${d.name}: nota del entrenador actualizada`);
    const bSlots = new Map(bd.slots.map((s) => [s.id, s]));
    const aIds = new Set(d.slots.map((s) => s.id));
    for (const s of d.slots) {
      const bs = bSlots.get(s.id);
      if (!bs) { out.push(`${d.name}: + ${s.exName}`); continue; }
      if (bs.exId !== s.exId) out.push(`${d.name}: ${bs.exName} → ${s.exName}`);
      for (const [k, label] of fields) {
        if ((bs[k] ?? null) !== (s[k] ?? null)) out.push(`${d.name} · ${s.exName}: ${label} ${bs[k] ?? '—'} → ${s[k] ?? '—'}`);
      }
      const bt = techniqueLabel(bs); const at = techniqueLabel(s);
      if (bt !== at) out.push(`${d.name} · ${s.exName}: técnica ${bt || 'ninguna'} → ${at || 'ninguna'}`);
    }
    for (const s of bd.slots) if (!aIds.has(s.id)) out.push(`${d.name}: − ${s.exName}`);
    const order = (arr) => arr.filter((s) => bSlots.has(s.id) && aIds.has(s.id)).map((s) => s.id).join();
    if (order(bd.slots) !== order(d.slots)) out.push(`${d.name}: orden de ejercicios cambiado`);
  }
  return out;
}

/** Siguiente día sugerido: el que sigue al último día entrenado. */
export function suggestNextDay(routine, lastSession) {
  const days = routine?.days || [];
  if (!days.length) return null;
  if (!lastSession || lastSession.routineId !== routine.id) return days[0];
  const i = days.findIndex((d) => d.id === lastSession.dayId);
  return days[(i + 1) % days.length] || days[0];
}

// ---------- Fechas ----------
export function localDate(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/** Semana ISO (lunes a domingo), ej. "2026-W43". */
export function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const week = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(week).padStart(2, '0')}`;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function shortDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const today = localDate();
  if (iso === today) return 'hoy';
  const yest = localDate(new Date(Date.now() - 86400000));
  if (iso === yest) return 'ayer';
  return `${d} ${MESES[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ''}`;
}

/** "23 oct" (sin "hoy"/"ayer", para el historial). */
export function dayMonth(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MESES[m - 1]}`;
}

/** "1 día" / "3 días" */
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const nDays = (n) => plural(n, 'día', 'días');
export const nEx = (n) => plural(n, 'ejercicio', 'ejercicios');
