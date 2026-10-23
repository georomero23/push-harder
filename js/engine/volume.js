/**
 * R6 · Volumen semanal: series efectivas por grupo muscular.
 *
 * Serie efectiva = serie de trabajo registrada con RIR ≤ 4.
 * Músculo principal cuenta 1 serie; secundario cuenta 0.5.
 * Si un mismo grupo aparece como principal y secundario en un ejercicio, cuenta solo 1.
 * Las sesiones de semana de descarga sí cuentan (es volumen real), pero se marcan aparte.
 */

export const EFFECTIVE_RIR_MAX = 4;

// Grupos que se muestran (mismo orden que los filtros del catálogo).
export const VOLUME_GROUPS = [
  ['pecho', 'Pecho', ['chest']],
  ['espalda', 'Espalda', ['lats', 'middle back', 'lower back', 'traps']],
  ['hombro', 'Hombro', ['shoulders', 'neck']],
  ['biceps', 'Bíceps', ['biceps']],
  ['triceps', 'Tríceps', ['triceps']],
  ['cuadriceps', 'Cuádriceps', ['quadriceps']],
  ['femoral', 'Femoral', ['hamstrings']],
  ['gluteo', 'Glúteo', ['glutes', 'abductors']],
  ['aductor', 'Aductor', ['adductors']],
  ['pantorrilla', 'Pantorrilla', ['calves']],
  ['abdomen', 'Abdomen', ['abdominals']],
  ['antebrazo', 'Antebrazo', ['forearms']],
];

const GROUP_OF = Object.fromEntries(VOLUME_GROUPS.flatMap(([id, , ms]) => ms.map((m) => [m, id])));

/** Peso por grupo de un ejercicio: { pecho: 1, hombro: 0.5, triceps: 0.5 } */
export function groupWeights(ex) {
  const w = {};
  for (const m of ex?.secondary || []) { const g = GROUP_OF[m]; if (g) w[g] = Math.max(w[g] || 0, 0.5); }
  for (const m of ex?.primary || []) { const g = GROUP_OF[m]; if (g) w[g] = 1; }
  return w;
}

export const isEffective = (set) => set?.done && (set.rir == null || Number(set.rir) <= EFFECTIVE_RIR_MAX);

/**
 * @param {Object[]} sessions  Sesiones de la semana (users/{sid}/sessions con el mismo `week`)
 * @param {(exId:string)=>Object|undefined} getExercise  Busca la ficha en el catálogo
 * @returns {{ groups: {id:string,label:string,sets:number}[], total:number, sessions:number }}
 */
export function weeklyVolume(sessions, getExercise) {
  const acc = Object.fromEntries(VOLUME_GROUPS.map(([id]) => [id, 0]));
  let counted = 0;
  for (const s of sessions || []) {
    if (!s?.entries) continue;
    counted++;
    for (const e of s.entries) {
      const n = e.sets.filter(isEffective).length;
      if (!n) continue;
      const w = groupWeights(getExercise(e.exId));
      for (const [g, k] of Object.entries(w)) acc[g] += n * k;
    }
  }
  const groups = VOLUME_GROUPS.map(([id, label]) => ({ id, label, sets: acc[id] }));
  return { groups, total: groups.reduce((t, g) => t + g.sets, 0), sessions: counted };
}
