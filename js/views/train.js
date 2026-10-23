// Modo entrenamiento: un ejercicio a la vez, GIF grande, series kg/reps/RIR,
// descanso automático y la sesión anterior siempre a la vista.
import { html, useState, useEffect, useRef, useMemo } from '../lib/deps.js';
import { store, useStore, toast, friendlyError, committed } from '../lib/store.js';
import { go, replace } from '../lib/router.js';
import { useWatch, useExerciseIndex } from '../lib/hooks.js';
import { repRange, fmtRest, techniqueLabel, techniqueOnSet, TECHNIQUE_HINT, TECHNIQUES } from '../lib/routine.js';
import { lastPerformance, fmtPerformance, setDefaults, sessionStats, recentFromEntry, fmtKg, entryTarget } from '../lib/session.js';
import { generateProposals } from '../lib/proposals.js';
import { StudentProposals } from './proposals.js';
import { primaryLabel } from '../lib/catalog.js';
import { shortDate } from '../lib/routine.js';
import { ExAnim, Icon, Sheet, Spinner } from '../lib/ui.js';

const RIR_OPTS = [0, 1, 2, 3, 4, 5];
const num = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// ---------- Utilidades de dispositivo ----------
function useWakeLock(on) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return undefined;
    let lock = null;
    let alive = true;
    const req = async () => { try { lock = await navigator.wakeLock.request('screen'); } catch { /* sin permiso */ } };
    req();
    const onVis = () => { if (alive && document.visibilityState === 'visible') req(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVis); lock?.release?.().catch(() => {}); };
  }, [on]);
}

function useNow(active, ms = 250) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function beep(ctxRef) {
  try {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const t = ctx.currentTime;
    [0, 0.28, 0.56].forEach((d, k) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = k === 2 ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.35, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(t + d);
      o.stop(t + d + 0.22);
    });
  } catch { /* sin audio */ }
}

const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ---------- Vista ----------
export function Train({ id }) {
  const me = useStore((s) => s.profile);
  const exIndex = useExerciseIndex();
  const sess = useWatch((fb, ok, fail) => fb.watchSession(me.id, id, ok, fail), [id]);
  const s = sess.data;
  const progress = useWatch((fb, ok, fail) => (s ? fb.watchProgress(me.id, s.routineId, ok, fail) : ok(null)), [s?.routineId]);
  const [idx, setIdx] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [sheet, setSheet] = useState(null); // 'list' | 'pain' | 'cues'
  const [finished, setFinished] = useState(null);
  const [busy, setBusy] = useState(false);
  const audio = useRef(null);
  const alerted = useRef(null);

  useWakeLock(!!s && s.status === 'open' && !finished);
  const restActive = !!(s?.restEndMs && Date.now() < s.restEndMs + 4000);
  const now = useNow(restActive);

  // Posición inicial: donde se quedó, o el primer ejercicio con series pendientes.
  useEffect(() => {
    if (!s || idx !== null) return;
    const firstOpen = s.entries.findIndex((e) => e.sets.some((x) => !x.done));
    setIdx(Number.isInteger(s.current) && s.current < s.entries.length ? s.current : Math.max(0, firstOpen));
  }, [s]);

  // Aviso al terminar el descanso.
  useEffect(() => {
    if (!s?.restEndMs || alerted.current === s.restEndMs) return;
    if (now >= s.restEndMs) {
      alerted.current = s.restEndMs;
      if (navigator.vibrate) navigator.vibrate([220, 120, 220]);
      beep(audio);
    }
  }, [now, s?.restEndMs]);

  if (sess.loading || (s && idx === null)) return html`<div class="train"><${Spinner} /></div>`;
  if (!s) {
    return html`<div class="train"><div class="page empty mt-lg"><b>Esta sesión ya no existe</b>
      <div class="mt"><button class="btn btn-primary" onClick=${() => go('/')}>Ir a inicio</button></div></div></div>`;
  }
  if (finished) return html`<${Summary} session=${{ ...s, id }} stats=${finished} me=${me} />`;
  if (s.status === 'done') return html`<${Summary} session=${{ ...s, id }} stats=${sessionStats(s)} me=${me} />`;

  const fb = store.get().fb;
  const entry = s.entries[idx];
  const ex = exIndex.get(entry.exId);
  const rx = entry.prescribed;
  const last = lastPerformance(progress.data, entry.slotId, entry.exId);
  const flag = progress.data?.flags?.[entry.slotId];
  const curSet = entry.sets.findIndex((x) => !x.done);
  const target = entryTarget(s, entry, last);
  const group = rx.ssGroup ? s.entries.map((e, i) => (e.prescribed.ssGroup === rx.ssGroup ? i : -1)).filter((i) => i >= 0) : null;
  const stats = sessionStats(s);
  const key = (i) => `${idx}-${i}`;
  const bodyweight = ['peso_corporal', 'ligas'].includes(ex?.equipment);

  const unlockAudio = () => {
    try {
      if (!audio.current) audio.current = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.current.state === 'suspended') audio.current.resume();
    } catch { /* sin audio */ }
  };

  const save = (patch) => fb.updateSession(me.id, id, patch).catch((e) => toast(friendlyError(e), 'bad'));

  function completeSet(i) {
    unlockAudio();
    const def = setDefaults(entry, i, last, target);
    const d = drafts[key(i)] || {};
    const kg = d.kg !== undefined ? num(d.kg) : def.kg;
    const reps = d.reps !== undefined ? num(d.reps) : def.reps;
    const rir = d.rir !== undefined ? Number(d.rir) : def.rir;
    if (reps == null || reps < 0) { toast('Escribe cuántas reps hiciste', 'bad'); return; }
    if (kg == null && !bodyweight) { toast('Escribe el peso que usaste (kg)', 'bad'); return; }
    const entries = s.entries.map((e, ei) => (ei !== idx ? e : {
      ...e, sets: e.sets.map((x, si) => (si !== i ? x : { kg: kg ?? 0, reps, rir, done: true, atMs: Date.now() })),
    }));

    // Superserie: pasa al siguiente del grupo sin descanso; al cerrar la vuelta, descansa.
    let nextIdx = idx;
    let restSec = rx.restSec;
    if (group && group.length > 1) {
      const pos = group.indexOf(idx);
      const partner = group.slice(pos + 1).find((gi) => entries[gi].sets[i] && !entries[gi].sets[i].done);
      if (partner !== undefined) { nextIdx = partner; restSec = 0; } else {
        const back = group.find((gi) => entries[gi].sets.some((x) => !x.done));
        nextIdx = back ?? nextUnfinished(entries, idx);
        restSec = Math.max(...group.map((gi) => entries[gi].prescribed.restSec));
      }
    } else if (entries[idx].sets.every((x) => x.done)) {
      nextIdx = nextUnfinished(entries, idx);
    }
    const allDone = entries.every((e) => e.sets.every((x) => x.done));
    const restEndMs = restSec > 0 && !allDone ? Date.now() + restSec * 1000 : null;
    save({ entries, current: nextIdx, restEndMs, restTotal: restSec });
    setDrafts((prev) => { const n = { ...prev }; delete n[key(i)]; return n; });
    if (nextIdx !== idx) setTimeout(() => setIdx(nextIdx), restSec === 0 ? 150 : 600);
    if (allDone) setTimeout(() => toast('¡Todas las series listas! Termina la sesión cuando quieras.'), 400);
  }

  function undoSet(i) {
    const x = entry.sets[i];
    setDrafts({ ...drafts, [key(i)]: { kg: x.kg ?? '', reps: x.reps ?? '', rir: x.rir ?? rx.rir } });
    const entries = s.entries.map((e, ei) => (ei !== idx ? e : { ...e, sets: e.sets.map((y, si) => (si !== i ? y : { ...y, done: false })) }));
    save({ entries });
  }

  const adjustRest = (delta) => save({ restEndMs: Math.max(Date.now() + 1000, s.restEndMs + delta * 1000) });
  const skipRest = () => save({ restEndMs: null });

  async function reportPain(note) {
    const entries = s.entries.map((e, ei) => (ei !== idx ? e : { ...e, pain: { note, atMs: Date.now() } }));
    save({ entries });
    try {
      await Promise.all([
        fb.patchProgress(me.id, s.routineId, { [`flags.${entry.slotId}`]: { note, exId: entry.exId, exName: entry.exName, since: s.date, sessionId: id, by: me.id } }),
        fb.addChange(me.id, { by: me.id, byRole: me.role, kind: 'pain_flag', routineId: s.routineId, slotId: entry.slotId, summary: [`Molestia en ${entry.exName}${note ? `: ${note}` : ''}`] }),
      ].map((p) => committed(p)));
      toast('Molestia registrada. Tu entrenador la verá y no se te subirá carga.');
    } catch (e) { toast(friendlyError(e), 'bad'); }
    setSheet(null);
  }

  async function finish() {
    const pending = stats.setsTotal - stats.setsDone;
    if (pending > 0 && !window.confirm(`Te faltan ${pending} series. ¿Terminar de todos modos?`)) return;
    setBusy(true);
    const endedAtMs = Date.now();
    const done = { ...s, id, endedAtMs };
    const patch = {};
    for (const e of s.entries) {
      const rec = recentFromEntry(e, done);
      if (!rec) continue;
      const prev = (progress.data?.recent?.[e.slotId] || []).filter((r) => r.sessionId !== id);
      patch[`recent.${e.slotId}`] = [rec, ...prev].slice(0, 3);
    }
    try {
      const st = sessionStats(done);
      const writes = [fb.updateSession(me.id, id, { status: 'done', endedAtMs, restEndMs: null, summary: st })];
      if (Object.keys(patch).length && progress.data) writes.push(fb.patchProgress(me.id, s.routineId, patch));
      await Promise.all(writes.map((p) => committed(p)));

      // Motor de progresión: solo genera propuestas; nada se aplica sin aprobación.
      if (progress.data) {
        const recentAfter = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k.replace('recent.', ''), v]));
        let existing = [];
        try { existing = await fb.listRecentProposals(me.id); } catch { /* sin caché aún */ }
        const { catalog, custom } = store.get();
        const gen = generateProposals({ session: done, recentAfter, progress: progress.data, exIndex, catalog: [...(catalog || []), ...custom], existing, me });
        if (gen.creates.length || gen.supersede.length) {
          await committed(fb.writeProposals(me.id, { ...gen, byUid: me.id, byRole: me.id === s.trainerId ? 'trainer' : 'student' }));
        }
      }
      setFinished(st);
    } catch (e) {
      toast(friendlyError(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    if (stats.setsDone > 0) { toast('Ya registraste series: mejor termina la sesión', 'bad'); return; }
    if (!window.confirm('¿Descartar esta sesión?')) return;
    committed(fb.deleteSession(me.id, id)).catch(() => {});
    replace('/');
  }

  const restLeft = s.restEndMs ? s.restEndMs - now : 0;
  const techSet = curSet >= 0 && techniqueOnSet(rx, curSet);

  return html`<div class=${`train ${s.restEndMs && now < s.restEndMs + 4000 ? 'resting' : ''}`}>
    <header class="train-top">
      <button class="icon-btn" aria-label="Salir (la sesión queda guardada)" onClick=${() => go('/')}><${Icon} name="close" /></button>
      <div class="segs" role="progressbar" aria-valuemin="0" aria-valuemax=${s.entries.length} aria-valuenow=${idx + 1}>
        ${s.entries.map((e, i) => {
          const d = e.sets.filter((x) => x.done).length;
          const cls = d === e.sets.length ? 'full' : d > 0 ? 'half' : '';
          return html`<button class=${`seg-i ${cls} ${i === idx ? 'cur' : ''}`} aria-label=${e.exName} onClick=${() => setIdx(i)}></button>`;
        })}
      </div>
      <button class="icon-btn" aria-label="Ejercicios de la sesión" onClick=${() => setSheet('list')}><${Icon} name="list" /></button>
    </header>

    <div class="page train-body">
      ${s.deload && html`<div class="banner"><${Icon} name="pause" />Semana de descarga: mismas cargas, series a la mitad, RIR +2 y sin técnicas.</div>`}
      <div class="train-media">
        ${ex ? html`<${ExAnim} key=${ex.id} ex=${ex} eager interval=${900} />` : html`<div class="anim ready"></div>`}
        ${rx.ssGroup && html`<span class="badge">Superserie ${rx.ssGroup}</span>`}
      </div>

      <div class="train-title">
        <small>Ejercicio ${idx + 1} de ${s.entries.length}${ex ? ` · ${primaryLabel(ex)}` : ''}</small>
        <h2>${entry.exName}</h2>
      </div>

      <div class="rx">
        <span><b>${rx.sets} × ${repRange(rx)}</b> reps</span>
        <span>RIR <b>${rx.rir}</b></span>
        <span><${Icon} name="timer" size="15" /> ${fmtRest(rx.restSec)}</span>
        ${rx.technique?.type && rx.technique.type !== 'none' && rx.technique.type !== 'superset' && html`<span class="rx-tech"><${Icon} name="bolt" size="15" />${techniqueLabel(rx)}</span>`}
      </div>

      <div class="last-box">
        <div>
          <small>${last ? `La vez pasada · ${shortDate(last.date)}` : 'La vez pasada'}</small>
          <b>${last ? fmtPerformance(last) : 'Primera vez con este ejercicio'}</b>
          ${last && html`<small>RIR ${last.rir.join(' · ')}</small>`}
        </div>
        ${rx.loadKg != null && html`<div class="today-load"><small>Carga</small><b>${fmtKg(rx.loadKg)} kg</b></div>`}
      </div>
      ${target && html`<div class="target"><${Icon} name="trend" size="16" />${target.text}</div>`}
      ${!last && rx.loadKg == null && html`<p class="hint" style="margin:-4px 2px 10px">Elige una carga con la que llegues a ${rx.repMin}–${rx.repMax} reps dejando ${rx.rir} en reserva.</p>`}
      ${rx.notes && html`<div class="coach-note"><small>Nota de tu entrenador</small>${rx.notes}</div>`}
      ${(flag || entry.pain) && html`<div class="banner"><${Icon} name="flag" />Molestia reportada${(entry.pain?.note || flag?.note) ? `: ${entry.pain?.note || flag?.note}` : ''}. No se te subirá carga en este ejercicio.</div>`}

      <div class="sets" role="table" aria-label="Series">
        <div class="set head" role="row"><span>Serie</span><span>Kg</span><span>Reps</span><span>RIR</span><span></span></div>
        ${entry.sets.map((x, i) => {
          const def = setDefaults(entry, i, last, target);
          const d = drafts[key(i)] || {};
          const tech = techniqueOnSet(rx, i);
          return html`<div class=${`set ${x.done ? 'done' : ''} ${i === curSet ? 'cur' : ''}`} role="row" key=${key(i)}>
            <span class="set-n">${i + 1}${tech && html`<i>${TECHNIQUES[rx.technique.type].split(' ')[0]}</i>`}</span>
            <input class="set-in" inputmode="decimal" aria-label=${`Kg serie ${i + 1}`} disabled=${x.done}
              placeholder=${def.kg ?? (bodyweight ? 'PC' : 'kg')} value=${x.done ? (bodyweight && !x.kg ? 'PC' : fmtKg(x.kg)) : d.kg ?? ''}
              onInput=${(e) => setDrafts({ ...drafts, [key(i)]: { ...d, kg: e.target.value } })} />
            <input class="set-in" inputmode="numeric" aria-label=${`Reps serie ${i + 1}`} disabled=${x.done}
              placeholder=${def.reps ?? ''} value=${x.done ? x.reps : d.reps ?? ''}
              onInput=${(e) => setDrafts({ ...drafts, [key(i)]: { ...d, reps: e.target.value } })} />
            <select class="set-rir" aria-label=${`RIR serie ${i + 1}`} disabled=${x.done}
              value=${x.done ? x.rir : d.rir ?? def.rir}
              onChange=${(e) => setDrafts({ ...drafts, [key(i)]: { ...d, rir: e.target.value } })}>
              ${RIR_OPTS.map((r) => html`<option value=${r}>${r === 5 ? '5+' : r}</option>`)}
            </select>
            <button class=${`set-check ${x.done ? 'on' : ''}`} aria-label=${x.done ? `Editar serie ${i + 1}` : `Serie ${i + 1} hecha`}
              onClick=${() => (x.done ? undoSet(i) : completeSet(i))}><${Icon} name="check" size="22" /></button>
          </div>`;
        })}
      </div>
      ${techSet && html`<p class="tech-hint"><${Icon} name="bolt" size="15" />Esta serie: ${TECHNIQUES[rx.technique.type]}. ${rx.technique.detail || TECHNIQUE_HINT[rx.technique.type]}</p>`}
      ${group && group.length > 1 && html`<p class="hint">Superserie ${rx.ssGroup}: ${group.map((gi) => s.entries[gi].exName).join(' + ')}. Descansas al terminar la vuelta.</p>`}

      <div class="two mt">
        <button class="btn" onClick=${() => setSheet('cues')}><${Icon} name="list" />Técnica</button>
        <button class="btn" onClick=${() => setSheet('pain')}><${Icon} name="flag" />Molestia</button>
      </div>
    </div>

    ${s.restEndMs && now < s.restEndMs + 4000 && html`<div class=${`rest ${restLeft <= 0 ? 'go' : ''}`} role="timer" aria-live="polite">
      ${restLeft > 0 ? html`
        <div class="rest-ring" style=${`--p:${Math.min(1, restLeft / ((s.restTotal || 1) * 1000))}`}><span>${mmss(restLeft)}</span></div>
        <div class="grow"><small>Descanso</small><b>${curSet >= 0 ? `Sigue: serie ${curSet + 1}` : 'Siguiente ejercicio'}</b></div>
        <button class="mini-btn" onClick=${() => adjustRest(-15)} aria-label="Quitar 15 segundos">−15</button>
        <button class="mini-btn" onClick=${() => adjustRest(15)} aria-label="Agregar 15 segundos">+15</button>
        <button class="mini-btn" onClick=${skipRest}>Saltar</button>
      ` : html`<b class="grow center">¡A darle!</b>`}
    </div>`}

    <footer class="train-bar">
      <button class="btn" aria-label="Ejercicio anterior" disabled=${idx === 0} onClick=${() => setIdx(idx - 1)}><${Icon} name="back" /></button>
      ${idx < s.entries.length - 1
        ? html`<button class="btn btn-primary grow" onClick=${() => setIdx(idx + 1)}><span class="ellipsis">Siguiente · ${s.entries[idx + 1].exName}</span><${Icon} name="right" /></button>`
        : html`<button class="btn btn-primary grow" disabled=${busy} onClick=${finish}><${Icon} name="check" />Terminar sesión</button>`}
    </footer>

    <${Sheet} open=${sheet === 'list'} onClose=${() => setSheet(null)} title=${s.dayName}>
      <div class="list">${s.entries.map((e, i) => {
        const d = e.sets.filter((x) => x.done).length;
        return html`<button class="row" key=${e.slotId} onClick=${() => { setIdx(i); setSheet(null); }}>
          <span class=${`avatar ${d === e.sets.length ? '' : 'off'}`} style="font-size:13px">${i + 1}</span>
          <span class="grow"><div class="title">${e.exName}</div><div class="subtitle">${d}/${e.sets.length} series${e.pain ? ' · molestia' : ''}</div></span>
        </button>`;
      })}</div>
      <div class="stack mt">
        <button class="btn btn-primary btn-block" disabled=${busy} onClick=${() => { setSheet(null); finish(); }}><${Icon} name="check" />Terminar sesión</button>
        ${stats.setsDone === 0 && html`<button class="btn btn-danger btn-block" onClick=${discard}><${Icon} name="trash" />Descartar sesión</button>`}
      </div>
    <//>
    <${PainSheet} open=${sheet === 'pain'} exName=${entry.exName} onClose=${() => setSheet(null)} onSave=${reportPain} />
    <${Sheet} open=${sheet === 'cues'} onClose=${() => setSheet(null)} title="Técnica">
      ${ex?.cues?.length ? html`<ol class="cues">${ex.cues.map((c) => html`<li>${c}</li>`)}</ol>` : html`<p class="muted">Sin indicaciones para este ejercicio.</p>`}
      ${ex && html`<button class="btn btn-block mt" onClick=${() => { setSheet(null); go(`/ej/${ex.id}`); }}>Ver ficha completa</button>`}
    <//>
  </div>`;
}

function nextUnfinished(entries, from) {
  for (let k = 1; k <= entries.length; k++) {
    const j = (from + k) % entries.length;
    if (entries[j].sets.some((x) => !x.done)) return j;
  }
  return from;
}

function PainSheet({ open, exName, onClose, onSave }) {
  const [note, setNote] = useState('');
  useEffect(() => { if (open) setNote(''); }, [open]);
  return html`<${Sheet} open=${open} onClose=${onClose} title="Reportar molestia">
    <p class="muted" style="margin-top:-8px">${exName}</p>
    <label class="field"><span>¿Qué sientes y dónde? (opcional)</span>
      <textarea class="textarea" maxlength="200" value=${note} placeholder="Molestia en hombro derecho al bajar" onInput=${(e) => setNote(e.target.value)}></textarea>
    </label>
    <p class="hint" style="margin:-4px 2px 14px">Tu entrenador lo verá y no se te subirá carga en este ejercicio. Si es dolor agudo, detente.</p>
    <button class="btn btn-primary btn-block" onClick=${() => onSave(note.trim())}><${Icon} name="flag" />Registrar molestia</button>
  <//>`;
}

function Summary({ session, stats, me }) {
  const best = session.entries.map((e) => {
    const done = e.sets.filter((x) => x.done);
    if (!done.length) return { name: e.exName, txt: 'Sin series' };
    const top = done.reduce((a, b) => ((b.kg || 0) * (b.reps || 0) > (a.kg || 0) * (a.reps || 0) ? b : a));
    return { name: e.exName, txt: `${done.length} series · mejor ${fmtKg(top.kg)} kg × ${top.reps}`, pain: !!e.pain };
  });
  return html`<div class="page train-done">
    <div class="eyebrow">Sesión terminada</div>
    <h2>${session.dayName}</h2>
    <div class="facts">
      <div class="fact"><small>Series</small><b>${stats.setsDone}/${stats.setsTotal}</b></div>
      <div class="fact"><small>Volumen</small><b>${stats.volumeKg.toLocaleString('es-MX')} kg</b></div>
      <div class="fact"><small>Duración</small><b>${stats.minutes} min</b></div>
    </div>
    <div class="section-title"><h2>Ejercicios</h2></div>
    <div class="list">${best.map((b) => html`<div class="row"><span class="grow"><div class="title">${b.name}</div><div class="subtitle">${b.txt}${b.pain ? ' · molestia' : ''}</div></span></div>`)}</div>
    <${StudentProposals} sid=${me.id} sessionId=${session.id} title="Propuestas del motor" />
    <button class="btn btn-primary btn-block mt" onClick=${() => replace('/')}>Listo</button>
  </div>`;
}
