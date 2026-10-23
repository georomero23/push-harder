// Conecta el motor (puro) con los datos: genera propuestas al cerrar sesión y aplica decisiones.
import { evaluateSlot, alreadyDecided, RULE_LABELS, ENGINE_VERSION } from '../engine/progression.js';
import { guard } from '../engine/guard.js';
import { slotFromEntry, fmtKg } from './session.js';
import { localDate, dayMonth } from './routine.js';

/** Rol con el que alguien decide: el entrenador del alumno (también sobre sí mismo) o el alumno. */
export const roleFor = (me, proposal) => (me.id === proposal.trainerId ? 'trainer' : 'student');
export const canDecide = (me, proposal) => proposal.scope === 'load' || roleFor(me, proposal) === 'trainer';

/**
 * Corre el motor para los ejercicios que se entrenaron en la sesión.
 * @returns {{ creates: {id:string,data:Object}[], supersede: string[] }}
 */
export function generateProposals({ session, recentAfter, progress, exIndex, catalog, existing, me }) {
  const creates = [];
  const supersede = [];
  const pending = existing.filter((p) => p.status === 'pending');
  const decided = existing.filter((p) => p.status === 'accepted' || p.status === 'rejected');

  for (const e of session.entries) {
    const history = recentAfter[e.slotId];
    if (!history?.length || history[0].sessionId !== session.id) continue; // no se entrenó hoy
    // Las pendientes de carga de este ejercicio se reemplazan por la evaluación nueva.
    const pendingHere = pending.filter((p) => p.slotId === e.slotId);
    supersede.push(...pendingHere.filter((p) => p.scope === 'load').map((p) => p.id));
    if (session.deload) continue; // la semana de descarga no cuenta para el motor

    const props = evaluateSlot({
      slot: slotFromEntry(e),
      exercise: exIndex.get(e.exId),
      history,
      currentLoadKg: progress?.loads?.[e.slotId]?.loadKg ?? null,
      flagged: !!progress?.flags?.[e.slotId] || !!e.pain,
      catalog,
    });
    for (const p of props) {
      try { guard(p, e.prescribed); } catch (err) { console.warn('Propuesta bloqueada por la guardia', err); continue; }
      if (alreadyDecided(p, decided)) continue;
      if (p.scope === 'structure' && pendingHere.some((x) => x.scope === 'structure' && x.rule === p.rule)) continue;
      creates.push({
        id: `${session.id}_${e.slotId}`,
        data: {
          ...p,
          studentId: session.studentId, trainerId: session.trainerId, routineId: session.routineId,
          sessionId: session.id, exName: e.exName, dayName: session.dayName,
          status: 'pending', createdAtMs: Date.now(), createdBy: me.id, engineVersion: ENGINE_VERSION,
        },
      });
    }
  }
  return { creates, supersede: [...new Set(supersede)] };
}

/**
 * Calcula los efectos de aceptar/rechazar. No escribe nada: devuelve el lote para fb.decideProposal.
 * @param {Object} o
 * @param {'accepted'|'rejected'} o.status
 * @param {Object} [o.option]   Para structure: { type: 'variant', exId, exName } | { type: 'deload' }
 * @param {Object} [o.routine]  Rutina actual (solo structure con variante)
 * @param {Object} [o.progress] Progreso actual
 * @param {number|null} [o.loadKg] Carga inicial para la variante elegida
 */
export function decisionEffects({ proposal: p, status, option, routine, progress, loadKg = null, exIndex }) {
  const label = RULE_LABELS[p.rule] || p.rule;
  if (status === 'rejected') {
    return { change: { kind: 'proposal_rejected', slotId: p.slotId, summary: [`${label} · ${p.exName}: rechazada`] }, note: '' };
  }
  if (p.scope === 'load') {
    return {
      progressPatch: { [`loads.${p.slotId}`]: { loadKg: p.to.loadKg, repTarget: p.to.repTarget ?? null } },
      change: { kind: 'proposal_accepted', slotId: p.slotId, summary: [`${label} · ${p.exName}: ${fmtKg(p.from?.loadKg)} → ${fmtKg(p.to.loadKg)} kg${p.to.repTarget ? `, reps a ${p.to.repTarget}` : ''}`] },
      note: '',
    };
  }
  if (option?.type === 'deload') {
    const from = localDate();
    const until = localDate(new Date(Date.now() + 6 * 86400000));
    return {
      progressPatch: { deload: { active: true, from, until, proposalId: p.id } },
      change: { kind: 'proposal_accepted', slotId: p.slotId, summary: [`${label} · ${p.exName}: semana de descarga del ${dayMonth(from)} al ${dayMonth(until)}`] },
      note: 'Semana de descarga',
    };
  }
  if (option?.type === 'variant' && routine) {
    const ex = exIndex?.get(option.exId);
    const days = routine.days.map((d) => ({
      ...d,
      slots: d.slots.map((s) => (s.id !== p.slotId ? s : { ...s, exId: option.exId, exName: option.exName, src: ex?.src || 'base', incrementKg: null })),
    }));
    const progressPatch = { [`loads.${p.slotId}`]: { loadKg: loadKg ?? null, repTarget: null } };
    const summary = [`${label} · ${p.exName} → ${option.exName}${loadKg != null ? ` con ${fmtKg(loadKg)} kg` : ''}`];
    if (p.rule === 'R5' && progress?.flags?.[p.slotId]) {
      const flags = { ...progress.flags };
      delete flags[p.slotId];
      progressPatch.flags = flags;
      summary.push(`Molestia de ${p.exName} cerrada al cambiar de ejercicio`);
    }
    return {
      routinePatch: { days, version: (routine.version || 1) + 1 },
      progressPatch,
      change: { kind: 'proposal_accepted', slotId: p.slotId, summary },
      note: `Variante: ${option.exName}`,
    };
  }
  throw new Error('Elige una opción');
}
