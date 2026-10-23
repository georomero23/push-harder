// Propuestas del motor, historial de cambios y volumen semanal (componentes compartidos).
import { html, useState, useMemo, useEffect } from '../lib/deps.js';
import { store, useStore, toast, friendlyError, committed } from '../lib/store.js';
import { go } from '../lib/router.js';
import { useWatch, useExerciseIndex } from '../lib/hooks.js';
import { RULE_LABELS } from '../engine/progression.js';
import { weeklyVolume, EFFECTIVE_RIR_MAX } from '../engine/volume.js';
import { decisionEffects, roleFor, canDecide } from '../lib/proposals.js';
import { isoWeek, shortDate, localDate } from '../lib/routine.js';
import { fmtKg, fmtPerformance, sessionStats } from '../lib/session.js';
import { Icon, ExAnim, Topbar, Sheet, Spinner, OfflineBanner, initials } from '../lib/ui.js';

const RULE_ICON = { R1: 'trend', R3: 'down', R4: 'swap', R5: 'flag' };

// ---------- Tarjeta de propuesta ----------
export function ProposalCard({ p, showStudent }) {
  const me = useStore((s) => s.profile);
  const exIndex = useExerciseIndex();
  const [choice, setChoice] = useState(p.options?.[0] || null);
  const [loadKg, setLoadKg] = useState('');
  const [busy, setBusy] = useState(false);
  const allowed = canDecide(me, p);
  const role = roleFor(me, p);

  async function decide(status) {
    setBusy(true);
    const fb = store.get().fb;
    try {
      let routine = null;
      let progress = null;
      if (status === 'accepted' && p.scope === 'structure') {
        [routine, progress] = await Promise.all([fb.getRoutine(p.studentId, p.routineId), fb.getProgress(p.studentId, p.routineId)]);
        if (!routine) throw new Error('La rutina ya no existe');
      }
      const fx = decisionEffects({ proposal: p, status, option: choice, routine, progress, loadKg: loadKg === '' ? null : Number(loadKg), exIndex });
      const res = await committed(fb.decideProposal({
        sid: p.studentId, proposalId: p.id, status, byUid: me.id, byRole: role, note: fx.note,
        routineId: p.routineId, progressPatch: fx.progressPatch, routinePatch: fx.routinePatch, change: fx.change,
      }));
      toast(res === 'queued' ? 'Guardado sin conexión; se aplica al volver la señal' : status === 'accepted' ? 'Propuesta aceptada' : 'Propuesta rechazada');
    } catch (e) {
      toast(friendlyError(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return html`<div class=${`prop prop-${p.rule}`}>
    <div class="prop-head">
      <span class="prop-ico"><${Icon} name=${RULE_ICON[p.rule] || 'bolt'} size="18" /></span>
      <span class="grow">
        <span class="eyebrow">${RULE_LABELS[p.rule]}${showStudent ? '' : ` · ${p.dayName || ''}`}</span>
        <b>${p.exName}</b>
      </span>
      <span class="faint" style="font-size:12px">${shortDate(localDate(new Date(p.createdAtMs)))}</span>
    </div>
    <p class="prop-reason">${p.reason}</p>
    ${p.scope === 'load' && html`<div class="prop-change">
      <span>${fmtKg(p.from?.loadKg)} kg</span><${Icon} name="right" size="18" /><b>${fmtKg(p.to.loadKg)} kg</b>
      ${p.to.repTarget && html`<small>· reps a ${p.to.repTarget}</small>`}
    </div>`}
    ${p.scope === 'structure' && html`<div class="prop-options" role="radiogroup">
      ${(p.options || []).map((o) => {
        const ex = o.exId ? exIndex.get(o.exId) : null;
        const on = choice && (o.type === 'deload' ? choice.type === 'deload' : choice.exId === o.exId);
        return html`<button class=${`prop-opt ${on ? 'on' : ''}`} role="radio" aria-checked=${on} disabled=${!allowed} onClick=${() => setChoice(o)}>
          <span class="prop-opt-media">${ex ? html`<${ExAnim} ex=${ex} size="thumb" />` : html`<${Icon} name="pause" />`}</span>
          <span class="grow">${o.type === 'deload' ? html`<b>Semana de descarga</b><small>Mismas cargas, series a la mitad, RIR +2, sin técnicas</small>` : html`<b>${o.exName}</b><small>Variante</small>`}</span>
        </button>`;
      })}
      ${!p.options?.length && html`<p class="hint">No encontré sustitutos en el catálogo; elige uno a mano en el editor.</p>`}
    </div>`}
    ${allowed && p.scope === 'structure' && choice?.type === 'variant' && html`<label class="field mt"><span>Carga inicial para ${choice.exName} (opcional)</span>
      <input class="input" type="number" inputmode="decimal" step="0.5" value=${loadKg} onInput=${(e) => setLoadKg(e.target.value)} placeholder="Déjalo vacío y la elige en su primera sesión" />
    </label>`}
    ${allowed ? html`<div class="two mt">
      <button class="btn" disabled=${busy} onClick=${() => decide('rejected')}><${Icon} name="close" />Rechazar</button>
      <button class="btn btn-primary" disabled=${busy || (p.scope === 'structure' && !choice)} onClick=${() => decide('accepted')}><${Icon} name="check" />Aceptar</button>
    </div>` : html`<p class="hint mt">Tu entrenador revisará esta propuesta.</p>`}
  </div>`;
}

/** Propuestas pendientes de un alumno. onCount reporta cuántas hay (para el panel). */
export function StudentProposals({ sid, title, onCount, sessionId, showStudent }) {
  const props = useWatch((fb, ok, fail) => fb.watchProposals(sid, 'pending', ok, fail), [sid]);
  const list = (props.data || []).filter((p) => !sessionId || p.sessionId === sessionId);
  useEffect(() => { if (onCount && props.data) onCount(sid, list.length); }, [props.data, sessionId]);
  if (!list.length) return null;
  return html`<div>
    ${title && html`<div class="section-title"><h2>${title}</h2><span class="faint" style="font-size:13px">${list.length}</span></div>`}
    <div class="stack">${list.map((p) => html`<${ProposalCard} key=${p.id} p=${p} showStudent=${showStudent} />`)}</div>
  </div>`;
}

// ---------- Panel del entrenador ----------
export function TrainerProposals() {
  const me = useStore((s) => s.profile);
  const students = useWatch((fb, ok, fail) => fb.watchStudents(me.id, ok, fail), [me.id]);
  const [counts, setCounts] = useState({});
  const people = [{ id: me.id, name: `Tú · ${me.name}` }, ...(students.data || []).filter((s) => s.active)];
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const onCount = (sid, n) => setCounts((c) => (c[sid] === n ? c : { ...c, [sid]: n }));

  return html`<div>
    <${Topbar} title="Propuestas" sub=${students.data ? `${total} pendientes` : ''} back backTo="/" />
    <div class="page">
      <${OfflineBanner} />
      <p class="muted" style="font-size:14px;margin-top:0">Nada cambia en una rutina hasta que aceptas. Carga y reps también las puede aceptar el alumno; variantes, sustitutos y descargas solo tú.</p>
      ${students.loading ? html`<${Spinner} />` : html`
        ${people.map((s) => html`<div key=${s.id}>
          ${counts[s.id] > 0 && html`<button class="who" onClick=${() => go(`/alumno/${s.id}`)}><span class="avatar">${initials(s.name.replace('Tú · ', ''))}</span><b>${s.name}</b><${Icon} name="right" /></button>`}
          <${StudentProposals} sid=${s.id} onCount=${onCount} showStudent />
        </div>`)}
        ${total === 0 && html`<div class="card empty"><b>Todo al día</b>Cuando tus alumnos terminen sesiones, aquí aparecerán las propuestas del motor.</div>`}
      `}
    </div>
  </div>`;
}

// ---------- Historial de cambios ----------
const KIND = {
  routine_assigned: ['calendar', 'Rutina asignada'],
  manual_edit: ['edit', 'Edición'],
  proposal_accepted: ['check', 'Propuesta aceptada'],
  proposal_rejected: ['close', 'Propuesta rechazada'],
  pain_flag: ['flag', 'Molestia'],
  flag_cleared: ['check', 'Molestia resuelta'],
};

export function ChangeLog({ sid, n = 25 }) {
  const me = useStore((s) => s.profile);
  const changes = useWatch((fb, ok, fail) => fb.watchChanges(sid, n, ok, fail), [sid]);
  if (changes.loading) return html`<${Spinner} />`;
  if (!changes.data?.length) return html`<div class="faint" style="font-size:14px">Sin cambios todavía.</div>`;
  return html`<div class="list">${changes.data.map((c) => {
    const [icon, label] = KIND[c.kind] || ['bolt', c.kind];
    const who = c.by === me.id ? 'Tú' : c.byRole === 'trainer' ? 'Entrenador' : 'Alumno';
    return html`<div class="row" key=${c.id} style="align-items:flex-start">
      <span class="avatar off" style="width:34px;height:34px;border-radius:10px"><${Icon} name=${icon} size="16" /></span>
      <span class="grow">
        <div class="title" style="font-size:14px">${label} <span class="faint" style="font-weight:600">· ${who} · ${shortDate(localDate(new Date(c.atMs)))}</span></div>
        ${(c.summary || []).slice(0, 4).map((line) => html`<div class="subtitle" style="white-space:normal">${line}</div>`)}
        ${(c.summary || []).length > 4 && html`<div class="subtitle">+${c.summary.length - 4} más</div>`}
      </span>
    </div>`;
  })}</div>`;
}

// ---------- Volumen semanal (R6) ----------
export function WeeklyVolume({ sid }) {
  const exIndex = useExerciseIndex();
  const [offset, setOffset] = useState(0);
  const week = isoWeek(new Date(Date.now() + offset * 7 * 86400000));
  const sessions = useWatch((fb, ok, fail) => fb.watchWeekSessions(sid, week, ok, fail), [sid, week]);
  const vol = useMemo(() => weeklyVolume(sessions.data || [], (id) => exIndex.get(id)), [sessions.data, exIndex]);
  const shown = vol.groups.filter((g) => g.sets > 0).sort((a, b) => b.sets - a.sets);
  const zero = vol.groups.filter((g) => g.sets === 0).map((g) => g.label);
  const max = Math.max(10, ...shown.map((g) => g.sets));

  return html`<div class="card">
    <div class="row-gap" style="justify-content:space-between">
      <button class="mini-btn" aria-label="Semana anterior" onClick=${() => setOffset(offset - 1)}><${Icon} name="back" size="18" /></button>
      <div class="center"><b>${offset === 0 ? 'Esta semana' : offset === -1 ? 'Semana pasada' : week.replace('-W', ' · semana ')}</b>
        <div class="faint" style="font-size:12.5px">${vol.sessions} ${vol.sessions === 1 ? 'sesión' : 'sesiones'} · ${fmtSets(vol.total)} series efectivas</div></div>
      <button class="mini-btn" aria-label="Semana siguiente" disabled=${offset >= 0} onClick=${() => setOffset(offset + 1)}><${Icon} name="right" size="18" /></button>
    </div>
    ${sessions.loading ? html`<${Spinner} />` : shown.length === 0 ? html`<p class="faint center" style="font-size:14px">Sin series registradas esta semana.</p>` : html`
      <div class="vol mt">${shown.map((g) => html`<div class="vol-row" key=${g.id}>
        <span>${g.label}</span>
        <span class="vol-bar"><i style=${`width:${(g.sets / max) * 100}%`}></i></span>
        <b>${fmtSets(g.sets)}</b>
      </div>`)}</div>
      ${zero.length > 0 && html`<p class="hint">Sin series: ${zero.join(', ')}.</p>`}`}
    <p class="hint">Serie efectiva: serie de trabajo con RIR ≤ ${EFFECTIVE_RIR_MAX}. Músculo principal cuenta 1; secundario, 0.5.</p>
  </div>`;
}
const fmtSets = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// ---------- Detalle de una sesión ----------
export function SessionSheet({ session, onClose }) {
  if (!session) return null;
  const st = sessionStats(session);
  return html`<${Sheet} open=${true} onClose=${onClose} title=${session.dayName}>
    <p class="muted" style="margin-top:-8px">${shortDate(session.date)} · ${st.setsDone}/${st.setsTotal} series · ${st.volumeKg.toLocaleString('es-MX')} kg${session.status === 'done' ? ` · ${st.minutes} min` : ' · en curso'}${session.deload ? ' · descarga' : ''}</p>
    <div class="list">${session.entries.map((e) => {
      const done = e.sets.filter((x) => x.done);
      const perf = done.length ? fmtPerformance({ kg: done.map((x) => x.kg), reps: done.map((x) => x.reps) }) : 'Sin series';
      return html`<div class="row" key=${e.slotId} style="align-items:flex-start"><span class="grow">
        <div class="title">${e.exName}</div>
        <div class="subtitle" style="white-space:normal">${perf}${done.length ? ` · RIR ${done.map((x) => x.rir).join('·')}` : ''}</div>
        ${e.pain && html`<div class="slot-warn"><${Icon} name="flag" size="14" />${e.pain.note || 'Molestia'}</div>`}
      </span></div>`;
    })}</div>
    ${session.coachNote && html`<div class="coach-note mt"><small>Nota del entrenador</small>${session.coachNote}</div>`}
  <//>`;
}

// ---------- Historial del alumno ----------
export function History() {
  const me = useStore((s) => s.profile);
  const sessions = useWatch((fb, ok, fail) => fb.watchRecentSessions(me.id, 30, ok, fail), [me.id]);
  const [open, setOpen] = useState(null);
  return html`<div>
    <${Topbar} title="Historial" />
    <div class="page">
      <${OfflineBanner} />
      <div class="section-title" style="margin-top:4px"><h2>Volumen semanal</h2></div>
      <${WeeklyVolume} sid=${me.id} />
      <${StudentProposals} sid=${me.id} title="Propuestas pendientes" />
      <div class="section-title"><h2>Sesiones</h2></div>
      ${sessions.loading ? html`<${Spinner} />` : !(sessions.data || []).length ? html`<div class="card empty"><b>Todavía no hay sesiones</b>Cuando termines tu primer entrenamiento aparecerá aquí.</div>` : html`
        <div class="list">${sessions.data.map((x) => { const st = sessionStats(x); return html`<button class="row" key=${x.id} onClick=${() => setOpen(x)}>
          <span class="grow"><div class="title">${x.dayName} · ${shortDate(x.date)}</div>
            <div class="subtitle">${x.status === 'open' ? 'En curso · ' : ''}${st.setsDone}/${st.setsTotal} series · ${st.volumeKg.toLocaleString('es-MX')} kg${x.deload ? ' · descarga' : ''}</div></span>
          <${Icon} name="right" />
        </button>`; })}</div>`}
      <div class="section-title"><h2>Cambios en tu rutina</h2></div>
      <${ChangeLog} sid=${me.id} />
    </div>
    <${SessionSheet} session=${open} onClose=${() => setOpen(null)} />
  </div>`;
}
