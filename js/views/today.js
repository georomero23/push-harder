// "Mi entrenamiento": rutina activa en Inicio, vista previa del día y arranque de sesión.
import { html, useState } from '../lib/deps.js';
import { store, useStore, toast, friendlyError } from '../lib/store.js';
import { go } from '../lib/router.js';
import { useWatch, useExerciseIndex } from '../lib/hooks.js';
import { suggestNextDay, slotSummary, shortDate, countSlots, nDays, nEx } from '../lib/routine.js';
import { buildSession, lastPerformance, fmtPerformance, sessionStats, fmtKg, deloadActive } from '../lib/session.js';
import { StudentProposals } from './proposals.js';
import { ExportSheet } from './export.js';
import { OfflinePrep } from './offline.js';
import { quietPrefetch } from '../lib/pwa.js';
import { Icon, ExAnim, Topbar, Spinner, OfflineBanner } from '../lib/ui.js';

/** Datos del entrenamiento propio: rutina activa, progreso, sesión abierta y recientes. */
export function useMyTraining() {
  const me = useStore((s) => s.profile);
  const routine = useWatch((fb, ok, fail) => fb.watchActiveRoutine(me.id, ok, fail), [me.id]);
  const progress = useWatch((fb, ok, fail) => (routine.data ? fb.watchProgress(me.id, routine.data.id, ok, fail) : ok(null)), [me.id, routine.data?.id]);
  const open = useWatch((fb, ok, fail) => fb.watchOpenSessions(me.id, ok, fail), [me.id]);
  const recent = useWatch((fb, ok, fail) => fb.watchRecentSessions(me.id, 5, ok, fail), [me.id]);
  return { me, routine, progress, open, recent };
}

export function startSession({ routine, day, progress, me, openSessions = [] }) {
  if (openSessions.length) {
    const o = openSessions[0];
    if (!window.confirm(`Tienes una sesión de ${o.dayName} sin terminar. ¿Empezar otra? (la anterior se queda guardada como en curso)`)) {
      go(`/entrenar/${o.id}`);
      return;
    }
  }
  if (!me.trainerId) { toast('Tu cuenta no tiene entrenador asignado', 'bad'); return; }
  const fb = store.get().fb;
  const id = fb.newId('users', me.id, 'sessions');
  const data = buildSession({ routine, day, progress, profile: me });
  // No se espera al servidor: con la caché offline la sesión existe al instante y se sincroniza sola.
  fb.createSession(me.id, id, data).catch((e) => toast(friendlyError(e), 'bad'));
  go(`/entrenar/${id}`);
}

export function MyTraining({ showEmpty = true }) {
  const { me, routine, progress, open, recent } = useMyTraining();
  const [exporting, setExporting] = useState(false);
  const exIndex = useExerciseIndex();
  if (routine.loading) return html`<${Spinner} />`;
  const r = routine.data;
  const openS = (open.data || []).sort((a, b) => b.startedAtMs - a.startedAtMs);
  const done = (recent.data || []).filter((s) => s.status === 'done');

  if (!r) {
    if (!showEmpty) return null;
    return html`<div class="section-title"><h2>Hoy</h2></div>
      <div class="card empty"><b>Aún no tienes rutina asignada</b>Cuando tu entrenador te la asigne, aquí verás el día que te toca y el modo entrenamiento.</div>`;
  }

  const next = suggestNextDay(r, done[0]);
  const deload = deloadActive(progress.data);
  if (next) quietPrefetch(r, next.id, exIndex); // el día que sigue queda listo sin señal
  return html`<div>
    ${deload && html`<div class="banner mt"><${Icon} name="pause" />Semana de descarga hasta el ${shortDate(progress.data.deload.until)}: mismas cargas, series a la mitad, RIR +2.</div>`}
    <${StudentProposals} sid=${me.id} title="Propuestas para ti" />
    ${openS.length > 0 && html`
      <div class="section-title"><h2>En curso</h2></div>
      ${openS.slice(0, 1).map((s) => { const st = sessionStats(s); return html`<button class="resume" onClick=${() => go(`/entrenar/${s.id}`)}>
        <span class="resume-dot"></span>
        <span class="grow"><b>${s.dayName}</b><small>${st.setsDone}/${st.setsTotal} series · empezaste ${shortDate(s.date)}</small></span>
        <span class="btn btn-sm btn-primary">Continuar</span>
      </button>`; })}`}

    <div class="section-title"><h2>Te toca</h2><span class="faint" style="font-size:13px">${r.name}</span></div>
    ${next && html`<div class="next-day">
      <div class="eyebrow">${next.name}</div>
      <h3>${next.focus || next.name}</h3>
      <p>${nEx(next.slots.length)} · ${next.slots.reduce((n, s) => n + s.sets, 0)} series</p>
      <div class="two">
        <button class="btn" onClick=${() => go(`/dia/${r.id}/${next.id}`)}>Ver día</button>
        <button class="btn btn-primary" disabled=${!next.slots.length || progress.loading}
          onClick=${() => startSession({ routine: r, day: next, progress: progress.data, me, openSessions: openS })}><${Icon} name="play" />Empezar</button>
      </div>
    </div>`}

    <div class="section-title"><h2>Tu semana</h2><button class="link-btn" onClick=${() => setExporting(true)}><${Icon} name="download" size="15" /> PDF</button></div>
    <div class="list">
      ${r.days.map((d) => html`<button class="row" key=${d.id} onClick=${() => go(`/dia/${r.id}/${d.id}`)}>
        <span class=${`avatar ${d.id === next?.id ? '' : 'off'}`} style="font-size:13px">${d.name.replace(/[^0-9]/g, '') || '·'}</span>
        <span class="grow"><div class="title">${d.name}${d.focus ? ` · ${d.focus}` : ''}</div><div class="subtitle">${nEx(d.slots.length)}</div></span>
        <${Icon} name="right" />
      </button>`)}
    </div>

    <div class="row-gap" style="justify-content:space-between;margin-top:10px">
      <span class="hint" style="margin:0">${nDays(r.days.length)} · ${nEx(countSlots(r))}</span>
      <${OfflinePrep} routine=${r} />
    </div>
    <${ExportSheet} open=${exporting} onClose=${() => setExporting(false)} routine=${r} sid=${me.id} studentName=${me.name} canSave=${me.trainerId === me.id} />
    ${done.length > 0 && html`
      <div class="section-title"><h2>Últimas sesiones</h2></div>
      <div class="list">${done.slice(0, 3).map((s) => { const st = sessionStats(s); return html`<div class="row" key=${s.id}>
        <span class="grow"><div class="title">${s.dayName} · ${shortDate(s.date)}</div>
          <div class="subtitle">${st.setsDone} series · ${st.volumeKg.toLocaleString('es-MX')} kg · ${st.minutes} min</div></span>
      </div>`; })}</div>`}
  </div>`;
}

export function DayPreview({ routineId, dayId }) {
  const { me, routine, progress, open } = useMyTraining();
  const exIndex = useExerciseIndex();
  if (routine.loading) return html`<div><${Topbar} title="" back /><${Spinner} /></div>`;
  const r = routine.data;
  const day = r && r.id === routineId ? r.days.find((d) => d.id === dayId) : null;
  if (!day) return html`<div><${Topbar} title="Día no disponible" back /><div class="page empty"><b>Este día ya no está en tu rutina activa</b></div></div>`;

  return html`<div class="shell-pad">
    <${Topbar} back eyebrow=${r.name} title=${day.name} sub=${day.focus} />
    <div class="page">
      <${OfflineBanner} />
      ${r.notes && html`<div class="card muted" style="font-size:14px;margin-bottom:12px">${r.notes}</div>`}
      <div class="stack">
        ${day.slots.map((s, i) => {
          const ex = exIndex.get(s.exId);
          const last = lastPerformance(progress.data, s.id, s.exId);
          const load = progress.data?.loads?.[s.id]?.loadKg;
          const flag = progress.data?.flags?.[s.id];
          return html`<button class="preview-row" key=${s.id} onClick=${() => ex && go(`/ej/${ex.id}`)}>
            <span class="preview-media">${ex && html`<${ExAnim} ex=${ex} size="thumb" />`}<span class="preview-n">${i + 1}</span></span>
            <span class="grow">
              <span class="slot-name">${s.exName}${s.ssGroup ? html` <span class="ss-badge">${s.ssGroup}</span>` : ''}</span>
              <span class="slot-sum">${slotSummary(s)}</span>
              ${(load != null || last) && html`<span class="slot-load">${load != null ? `Carga: ${fmtKg(load)} kg` : ''}${load != null && last ? ' · ' : ''}${last ? `Última: ${fmtPerformance(last)}` : ''}</span>`}
              ${flag && html`<span class="slot-warn"><${Icon} name="flag" size="14" />Molestia reportada: no se sube carga</span>`}
            </span>
          </button>`;
        })}
      </div>
    </div>
    <div class="save-bar"><div class="page">
      <button class="btn btn-primary btn-block" disabled=${!day.slots.length || progress.loading}
        onClick=${() => startSession({ routine: r, day, progress: progress.data, me, openSessions: open.data || [] })}><${Icon} name="play" />Empezar ${day.name}</button>
    </div></div>
  </div>`;
}
