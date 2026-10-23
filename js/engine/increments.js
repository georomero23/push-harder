// Incremento de carga por ejercicio (lo usa la regla 1 del motor y el editor como sugerencia).
//
// Regla acordada: +2.5 kg tren superior, +5 kg tren inferior, o el incremento mínimo del
// equipo cuando el equipo no permite ese salto. El entrenador puede fijar `incrementKg`
// en cada ejercicio de la rutina y ese valor siempre gana.

const BY_EQUIPMENT = {
  mancuerna: 2,    // mancuernas de 2 en 2 kg (lo común en gyms de MX); ajústalo por slot si tu gym usa 2.5
  maquina: 5,      // placas de stack
  pesa_rusa: 4,
  peso_corporal: 0, // sin carga externa: se progresa por reps o con lastre
  ligas: 0,
};

/** Incremento sugerido para un ejercicio del catálogo. */
export function defaultIncrement(ex) {
  if (!ex) return 2.5;
  if (ex.equipment in BY_EQUIPMENT) return BY_EQUIPMENT[ex.equipment];
  return ex.region === 'inferior' ? 5 : 2.5;
}

/** Incremento efectivo de un slot de rutina. */
export function slotIncrement(slot, ex) {
  const v = Number(slot?.incrementKg);
  return Number.isFinite(v) && v > 0 ? v : defaultIncrement(ex);
}
