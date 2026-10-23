/**
 * Guardia "INTENSIDAD ≠ VOLUMEN".
 *
 * Toda propuesta (del motor de reglas o de una IA futura) pasa por aquí antes de guardarse.
 * Se rechaza cualquier cosa que agregue ejercicios o series. Subir intensidad solo puede ser
 * carga o técnica sin series extra. Reducir volumen (descarga) sí se permite.
 */

export const ALLOWED_KINDS = ['load_up', 'load_down', 'plateau', 'substitute'];
const SETS_ADDING_TECHNIQUES = ['fst7'];

export class GuardError extends Error {}

/**
 * @param {Object} proposal
 * @param {{ sets?: number }} [currentSlot]  Prescripción actual del ejercicio
 * @returns {Object} la misma propuesta si es válida
 * @throws {GuardError}
 */
export function guard(proposal, currentSlot = {}) {
  if (!proposal || !ALLOWED_KINDS.includes(proposal.kind)) {
    throw new GuardError(`Tipo de propuesta no permitido: ${proposal?.kind}`);
  }
  if (!['load', 'structure'].includes(proposal.scope)) throw new GuardError('Alcance inválido');
  const to = proposal.to || {};
  if (to.addExercise || to.addSlot || proposal.addExercise) throw new GuardError('No se agregan ejercicios');
  if (Number.isFinite(to.sets) && Number.isFinite(currentSlot.sets) && to.sets > currentSlot.sets) {
    throw new GuardError('No se agregan series');
  }
  if (to.technique && SETS_ADDING_TECHNIQUES.includes(to.technique.type || to.technique)) {
    throw new GuardError('Esa técnica agrega series (FST-7): solo la asigna el entrenador a mano');
  }
  for (const o of proposal.options || []) {
    if (!['variant', 'deload'].includes(o.type)) throw new GuardError(`Opción no permitida: ${o.type}`);
  }
  if (proposal.kind === 'load_up' && !(to.loadKg > (proposal.from?.loadKg ?? -Infinity))) {
    throw new GuardError('Una subida de carga debe subir la carga');
  }
  if (proposal.kind === 'load_down' && !(to.loadKg < (proposal.from?.loadKg ?? Infinity))) {
    throw new GuardError('Una bajada de carga debe bajar la carga');
  }
  return proposal;
}
