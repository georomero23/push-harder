// Ficha de un alumno (vista del entrenador): rutina activa, asignar, sesiones, molestias, acceso.
import { html, useState } from '../lib/deps.js';
import { store, useStore, toast, friendlyError, committed } from '../lib/store.js';
import { go } from '../lib/router.js';
import { useWatch } from '../lib/hooks.js';
import { countSlots, emptyRoutine, clone, shortDate, nDays, nEx } from '../lib/routine.js';
import { sessionStats } from '../lib/session.js';
import { Icon, Topbar, Sheet, Spinner, OfflineBanner, initials } from '../lib/ui.js';
import { StudentProposals, WeeklyVolume, ChangeLog, SessionSheet } from './proposals.js';
import { ExportSheet } from './export.js';

export function StudentDetail({ sid }) {
  const me = useStore((s) => s.profile);
  const user = useWatch((fb, ok, fail) => fb.watchUser(sid, ok, fail), [sid]);
  const routines = useWatch((fb, ok, fail) => fb.watchRoutines(sid, ok, fail), [sid]);
  const sessions = useWatch((fb, ok, fail) => fb.watchRecentSessions(sid, 6, ok, fail), [sid]);
  const active = (routines.data || []).filter((r) => r.status === 'active').sort((a, b) => (b.assignedAtMs || 0) - (a.assignedAtMs || 0))[0];
  const progress = useWatch((fb, ok, fail) => (active ? fb.watchProgress(sid, active.id, ok, fail) : ok(null)), [sid, active?.id]);
  const [assigning, setAssigning] = useState(false);
  const [openSession, setOpenSession] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const fb = store.get().fb;

  if (user.loading) return html`<div><${Topbar} title="" back backTo="/alumnos" /><${Spinner} /></div>`;
  if (!user.data) return html`<div><${Topbar} title="No encontrado" back backTo="/alumnos" /></div>`;
  const s = user.data;
  const isMe = sid === me.id;
  const archived = (routines.data || []).filter((r) => r.status !== 'active').sort((a, b) => (b.assignedAtMs || 0) - (a.assignedAtMs || 0));
  const flags = Object.entries(progress.data?.flags || {});

  async function run(fn, ok) {
    setBusy(true);
    try { const r = await committed(fn()); toast(r === 'queued' ? 'Guardado sin conexión' : ok); } catch (e) { toast(friendlyError(e), 'bad'); } finally { setBusy(false); }
  }
  const clearFlag = (slotId, f) => run(async () => {
    const rest = { ...(progress.data.flags || {}) };
    delete rest[slotId];
    await fb.patchProgress(sid, active.id, { flags: rest });
    await fb.addChange(sid, { by: me.id, byRole: 'trainer', kind: 'flag_cleared', routineId: active.id, slotId, summary: [`Molestia resuelta: ${f.exName}`] });
  }, 'Molestia marcada como resuelta');

  return html`<div>
    <${Topbar} back backTo="/alumnos" eyebrow=${isMe ? 'Tu ficha' : 'Alumno'} title=${s.name} sub=${s.email} />
    <div class="page">
      <${OfflineBanner} />
      ${!s.active && html`<div class="banner"><${Icon} name="pause" />Acceso en pausa.</div>`}

      <div class="section-title"><h2>Rutina activa</h2></div>
      ${routines.loading ? html`<${Spinner} />` : active ? html`
        <div class="card routine-card">
          <div class="eyebrow">v${active.version || 1}</div>
          <div class="routine-name">${active.name}</div>
          <div class="muted" style="font-size:14px">${nDays(active.days.length)} · ${nEx(countSlots(active))}${active.goal ? ` · ${active.goal}` : ''}</div>
          <div class="day-pills">${active.days.map((d) => html`<span>${d.name}${d.focus ? ` · ${d.focus}` : ''}</span>`)}</div>
          <div class="two mt">
            <button class="btn" onClick=${() => go(`/alumno/${sid}/rutina/${active.id}`)}><${Icon} name="edit" />Editar</button>
            <button class="btn" disabled=${busy} onClick=${() => window.confirm('¿Archivar esta rutina? El historial se conserva.') && run(() => fb.setRoutineStatus(sid, active.id, 'archived'), 'Rutina archivada')}><${Icon} name="archive" />Archivar</button>
          </div>
          <button class="btn btn-block mt" onClick=${() => setExporting(true)}><${Icon} name="download" />Exportar PDF</button>
        </div>` : html`<div class="card empty"><b>Sin rutina asignada</b>Asígnale una plantilla o arma una desde cero.</div>`}
      <button class="btn btn-primary btn-block mt" onClick=${() => setAssigning(true)}><${Icon} name="plus" />${active ? 'Asignar otra rutina' : 'Asignar rutina'}</button>

      <${StudentProposals} sid=${sid} title="Propuestas pendientes" />

      ${flags.length > 0 && html`
        <div class="section-title"><h2>Molestias reportadas</h2></div>
        <div class="list">${flags.map(([slotId, f]) => html`<div class="row" key=${slotId}>
          <span class="avatar off"><${Icon} name="flag" size="18" /></span>
          <span class="grow"><div class="title">${f.exName}</div><div class="subtitle">${f.note || 'Sin nota'} · ${shortDate(f.since)}</div></span>
          <button class="btn btn-sm" disabled=${busy} onClick=${() => clearFlag(slotId, f)}>Resuelta</button>
        </div>`)}</div>
        <p class="hint">Mientras tenga la marca, el motor no le subirá carga a ese ejercicio.</p>`}

      <div class="section-title"><h2>Volumen semanal</h2></div>
      <${WeeklyVolume} sid=${sid} />

      <div class="section-title"><h2>Últimas sesiones</h2></div>
      ${sessions.loading ? html`<${Spinner} />` : (sessions.data || []).length === 0 ? html`<div class="faint" style="font-size:14px">Todavía no entrena con la app.</div>` : html`
        <div class="list">${sessions.data.map((x) => { const st = sessionStats(x); return html`<button class="row" key=${x.id} onClick=${() => setOpenSession(x)}>
          <span class="grow"><div class="title">${x.dayName} · ${shortDate(x.date)}</div>
            <div class="subtitle">${x.status === 'open' ? 'En curso · ' : ''}${st.setsDone}/${st.setsTotal} series · ${st.volumeKg.toLocaleString('es-MX')} kg${x.status === 'done' ? ` · ${st.minutes} min` : ''}</div></span>
          ${x.entries.some((e) => e.pain) && html`<span class="status off">Molestia</span>`}
        </button>`; })}</div>`}

      <div class="section-title"><h2>Historial de cambios</h2></div>
      <${ChangeLog} sid=${sid} />

      ${archived.length > 0 && html`
        <div class="section-title"><h2>Rutinas anteriores</h2></div>
        <div class="list">${archived.map((r) => html`<button class="row" key=${r.id} onClick=${() => go(`/alumno/${sid}/rutina/${r.id}`)}>
          <span class="grow"><div class="title">${r.name}</div><div class="subtitle">${r.status === 'draft' ? 'Borrador' : 'Archivada'} · ${nDays(r.days.length)}</div></span>
          <${Icon} name="right" />
        </button>`)}</div>`}

      ${!isMe && html`
        <div class="section-title"><h2>Acceso</h2></div>
        <div class="stack">
          <button class="btn btn-block" disabled=${busy} onClick=${() => run(() => fb.resetPassword(s.email), 'Correo enviado')}><${Icon} name="mail" />Reenviar correo de contraseña</button>
          <button class=${`btn btn-block ${s.active ? 'btn-danger' : ''}`} disabled=${busy} onClick=${() => run(() => fb.setStudentActive(sid, !s.active), s.active ? 'Alumno en pausa' : 'Alumno reactivado')}>
            <${Icon} name=${s.active ? 'pause' : 'play'} />${s.active ? 'Pausar acceso' : 'Reactivar acceso'}
          </button>
        </div>`}
    </div>
    <${SessionSheet} session=${openSession} onClose=${() => setOpenSession(null)} />
    <${ExportSheet} open=${exporting} onClose=${() => setExporting(false)} routine=${active} sid=${sid} studentName=${s.name} canSave />
    <${AssignSheet} open=${assigning} onClose=${() => setAssigning(false)} sid=${sid} me=${me} activeIds=${active ? [active.id] : []} accent=${active?.pdfAccent} />
  </div>`;
}

function AssignSheet({ open, onClose, sid, me, activeIds, accent }) {
  const tpls = useWatch((fb, ok, fail) => (open ? fb.watchTemplates(me.id, ok, fail) : ok(null)), [open, me.id]);
  const [busy, setBusy] = useState(false);

  async function assign(tpl) {
    setBusy(true);
    const fb = store.get().fb;
    const src = tpl ? { name: tpl.name, goal: tpl.goal || '', notes: tpl.notes || '', days: clone(tpl.days), templateId: tpl.id } : { ...emptyRoutine(), name: 'Rutina nueva' };
    if (accent) src.pdfAccent = accent; // el color del alumno pasa a su rutina nueva
    try {
      const p = fb.assignRoutine({ sid, trainerId: me.id, data: src, currentActiveIds: activeIds });
      const rid = navigator.onLine ? await p : 'pending';
      if (rid === 'pending') { p.catch((e) => toast(friendlyError(e), 'bad')); toast('Asignada sin conexión; se sincroniza sola'); onClose(); return; }
      toast('Rutina asignada. Ponle su carga inicial a cada ejercicio.');
      onClose();
      go(`/alumno/${sid}/rutina/${rid}`);
    } catch (e) {
      toast(friendlyError(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return html`<${Sheet} open=${open} onClose=${onClose} title="Asignar rutina">
    ${activeIds.length > 0 && html`<div class="banner"><${Icon} name="archive" />La rutina activa se archiva; su historial se conserva.</div>`}
    ${tpls.loading ? html`<${Spinner} />` : html`<div class="list">
      ${(tpls.data || []).map((t) => html`<button class="row" key=${t.id} disabled=${busy} onClick=${() => assign(t)}>
        <span class="grow"><div class="title">${t.name}</div><div class="subtitle">${nDays(t.days.length)} · ${nEx(countSlots(t))}</div></span>
        <${Icon} name="right" />
      </button>`)}
      <button class="row" disabled=${busy} onClick=${() => assign(null)}>
        <span class="grow"><div class="title">En blanco</div><div class="subtitle">Armarla solo para este alumno</div></span>
        <${Icon} name="plus" />
      </button>
    </div>`}
  <//>`;
}
