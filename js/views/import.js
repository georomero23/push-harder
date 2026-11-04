// Cargar una rutina desde PDF: leer → revisar ejercicio por ejercicio → asignar al alumno o guardar como plantilla.
// Nada se guarda sin que el entrenador lo confirme.
import { html, useState, useMemo, useRef } from '../lib/deps.js';
import { store, useStore, toast, friendlyError, committed } from '../lib/store.js';
import { go, back, replace } from '../lib/router.js';
import { useWatch, useExerciseIndex } from '../lib/hooks.js';
import { slotSummary, countSlots, nDays, nEx } from '../lib/routine.js';
import { primaryLabel } from '../lib/catalog.js';
import { ExAnim, Topbar, Sheet, Icon, Spinner, OfflineBanner } from '../lib/ui.js';
import { ExercisePicker } from './picker.js';

const LEVEL = { alta: 'Coincidencia alta', media: 'Coincidencia media', baja: 'Coincidencia baja' };

export function ImportReview({ sid = '' }) {
  const me = useStore((s) => s.profile);
  const base = useStore((s) => s.catalog);
  const custom = useStore((s) => s.custom);
  const exIndex = useExerciseIndex();
  const students = useWatch((fb, ok, fail) => fb.watchStudents(me.id, ok, fail), [me.id]);

  const [phase, setPhase] = useState('pick'); // pick | reading | review
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState('');
  const [draft, setDraft] = useState(null);
  const [dest, setDest] = useState(sid);
  const [alsoTemplate, setAlsoTemplate] = useState(false);
  const [editing, setEditing] = useState(null); // { di, si }
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef();
  const mod = useRef(null);

  const routines = useWatch((fb, ok, fail) => (dest ? fb.watchRoutines(dest, ok, fail) : ok(null)), [dest]);
  const actives = (routines.data || []).filter((r) => r.status === 'active').sort((a, b) => (b.assignedAtMs || 0) - (a.assignedAtMs || 0));
  const people = useMemo(() => [{ id: me.id, name: `Tú · ${me.name}` },
    ...(students.data || []).slice().sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name, 'es'))
      .map((s) => ({ id: s.id, name: s.active ? s.name : `${s.name} (en pausa)` }))], [students.data, me]);
  const destName = dest === me.id ? 'ti' : (people.find((p) => p.id === dest)?.name || 'el alumno').replace(/ \(en pausa\)$/, '');

  const slots = draft ? draft.days.flatMap((d) => d.slots) : [];
  const missing = slots.filter((s) => !s.exId).length;
  const review = mod.current ? slots.filter((s) => mod.current.needsReview(s)).length : 0;

  async function read(f) {
    if (!f) return;
    if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) { setError('Ese archivo no es PDF.'); return; }
    if (f.size > 25 * 1024 * 1024) { setError('El PDF pesa más de 25 MB. Expórtalo más ligero.'); return; }
    setError(''); setFile(f); setPhase('reading'); setStep('Preparando…');
    try {
      const [pdf, draftMod] = await Promise.all([import('../import/pdf.js'), import('../import/draft.js')]);
      mod.current = draftMod;
      const catalog = [...(base || []), ...custom];
      if (!catalog.length) throw new Error('El catálogo todavía no carga. Intenta en unos segundos.');
      const res = await pdf.importPdf(f, catalog, me.prefs?.importAliases || {}, setStep);
      if (!countSlots(res.draft)) {
        setError(res.draft.warnings?.[0] || 'No encontré ejercicios en este PDF.');
        setPhase('pick');
        return;
      }
      setKind(res.kind);
      setDraft(res.draft);
      setPhase('review');
      window.scrollTo(0, 0);
    } catch (e) {
      console.error(e);
      const offline = !navigator.onLine || /fetch|import|module/i.test(String(e?.message));
      setError(offline ? 'No se pudo abrir el lector de PDF. Revisa tu conexión e inténtalo de nuevo.'
        : /password/i.test(String(e?.name || e?.message)) ? 'El PDF tiene contraseña. Quítasela y vuelve a intentar.'
          : 'No pude leer este PDF. Si es una foto o un escaneo, la app no puede leer su texto.');
      setPhase('pick');
    }
  }

  // ---------- Editar el borrador ----------
  const patchSlot = (di, si, patch) => setDraft((d) => ({
    ...d,
    days: d.days.map((day, i) => (i !== di ? day : { ...day, slots: day.slots.map((s, j) => (j !== si ? s : { ...s, ...patch, _import: { ...s._import, ...(patch._import || {}) } })) })),
  }));
  const removeSlot = (di, si) => {
    setDraft((d) => ({ ...d, days: d.days.map((day, i) => (i !== di ? day : { ...day, slots: day.slots.filter((_, j) => j !== si) })) }));
    setEditing(null);
  };
  const removeDay = (di) => {
    const day = draft.days[di];
    if (draft.days.length === 1) { toast('La rutina necesita al menos un día', 'bad'); return; }
    if (!window.confirm(`¿Quitar ${day.name} (${nEx(day.slots.length)}) de la importación?`)) return;
    setDraft({ ...draft, days: draft.days.filter((_, i) => i !== di) });
  };
  const pickEx = (ex, how = 'changed') => {
    const { di, si } = editing;
    patchSlot(di, si, { exId: ex.id, src: ex.src || 'base', _import: { [how]: true } });
  };

  // ---------- Guardar ----------
  async function save() {
    const { cleanDraft, learnedFrom } = mod.current;
    let data;
    try { data = cleanDraft(draft); } catch (e) { toast(e.message, 'bad'); return; }
    setBusy(true);
    const fb = store.get().fb;
    const learned = learnedFrom(draft);
    if (Object.keys(learned).length) fb.saveImportAliases(me.id, learned).catch((e) => console.warn('alias', e));
    try {
      let tplId = null;
      if (!dest || alsoTemplate) {
        tplId = fb.newId('templates');
        const res = await committed(fb.saveTemplate(tplId, { ...data, trainerId: me.id }, true));
        if (!dest) {
          toast(res === 'queued' ? 'Plantilla guardada sin conexión; se sincroniza sola' : 'Plantilla guardada');
          replace(`/plantilla/${tplId}`);
          return;
        }
      }
      const src = { ...data, ...(tplId ? { templateId: tplId } : {}) };
      if (actives[0]?.pdfAccent) src.pdfAccent = actives[0].pdfAccent; // conserva el color del alumno
      const p = fb.assignRoutine({ sid: dest, trainerId: me.id, data: src, currentActiveIds: actives.map((r) => r.id) });
      if (!navigator.onLine) {
        p.catch((e) => toast(friendlyError(e), 'bad'));
        toast('Asignada sin conexión; se sincroniza sola');
        replace(`/alumno/${dest}`);
        return;
      }
      const rid = await p;
      toast('Rutina cargada. Ponle su carga inicial a cada ejercicio.');
      replace(`/alumno/${dest}/rutina/${rid}`);
    } catch (e) {
      toast(friendlyError(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  const leave = () => {
    if (phase !== 'review' || window.confirm('Si sales ahora no se guarda nada de este PDF. ¿Salir?')) back(sid ? `/alumno/${sid}` : '/');
  };

  // ---------- Elegir archivo ----------
  if (phase !== 'review') {
    const onDrop = (e) => { e.preventDefault(); setDrag(false); read(e.dataTransfer?.files?.[0]); };
    return html`<div>
      <${Topbar} back onBack=${leave} eyebrow=${sid ? `Para ${destName}` : 'Rutinas'} title="Importar PDF" />
      <div class="page">
        <${OfflineBanner} />
        ${phase === 'reading' ? html`
          <div class="card import-reading" role="status">
            <div class="spinner"></div>
            <b>${step}</b>
            <span class="muted">${file?.name}</span>
          </div>` : html`
          ${error && html`<div class="error-box" role="alert">${error}</div>`}
          <label class=${`dropzone ${drag ? 'over' : ''}`} onDragOver=${(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave=${() => setDrag(false)} onDrop=${onDrop}>
            <input ref=${input} type="file" accept="application/pdf,.pdf" class="sr-only"
              onChange=${(e) => { read(e.target.files?.[0]); e.target.value = ''; }} />
            <span class="dz-ico"><${Icon} name="upload" /></span>
            <b>Elige el PDF de la rutina</b>
            <span class="muted">Desde tu teléfono, Drive o WhatsApp</span>
            <span class="btn btn-primary mt">Elegir PDF</span>
          </label>
          <div class="card mt import-how">
            <h3>Cómo funciona</h3>
            <ol>
              <li><b>Lee el PDF</b> días, ejercicios, series × reps, descansos, técnicas, alternativas y notas.</li>
              <li><b>Busca cada ejercicio</b> en el catálogo para ponerle su animación. Los dudosos quedan marcados.</li>
              <li><b>Revisas y confirmas.</b> Nada se guarda hasta que tú lo apruebes.</li>
            </ol>
            <p class="hint">Los PDF que exporta la app se cargan exactos. Los tuyos (estilo PushHarder) se leen; si el PDF es una foto o escaneo, no tiene texto que leer.</p>
          </div>`}
      </div>
    </div>`;
  }

  // ---------- Revisión ----------
  const cur = editing && draft.days[editing.di]?.slots[editing.si];
  const saveLabel = missing ? `Faltan ${missing} por elegir`
    : !dest ? 'Guardar como plantilla' : `Cargar a ${dest === me.id ? 'tu rutina' : destName.split(' ')[0]}`;

  return html`<div>
    <${Topbar} back onBack=${leave} eyebrow="Revisar importación" title=${draft.name || 'Rutina importada'} />
    <div class="page editor" style="padding-bottom:110px">
      <${OfflineBanner} />
      <div class="card import-summary">
        <div class="eyebrow">${kind === 'exacto' ? 'PDF de PUSH HARDER · exacto' : 'Leído de tu PDF'}</div>
        <div class="import-stats">
          <span><b>${draft.days.length}</b>${draft.days.length === 1 ? 'día' : 'días'}</span>
          <span><b>${slots.length}</b>ejercicios</span>
          <span class=${review ? 'warn' : 'ok'}><b>${review || '✓'}</b>${review ? 'por revisar' : 'reconocidos'}</span>
        </div>
        <div class="faint" style="font-size:12.5px;margin-top:8px;word-break:break-all">${file?.name}</div>
      </div>
      ${(draft.warnings || []).length > 0 && html`<div class="banner mt"><${Icon} name="alert" /><span>${draft.warnings.slice(0, 3).join(' ')}</span></div>`}
      ${review > 0 && html`<p class="hint" style="margin:10px 2px 0">Toca los marcados en <b class="txt-warn">amarillo</b> para confirmar o cambiar el ejercicio del catálogo. Lo que corrijas, la app lo aprende para el próximo PDF.</p>`}

      <label class="field mt"><span>Nombre de la rutina</span>
        <input class="input" value=${draft.name} maxlength="60" onInput=${(e) => setDraft({ ...draft, name: e.target.value })} />
      </label>
      <label class="field"><span>Objetivo (opcional)</span>
        <input class="input" value=${draft.goal || ''} maxlength="90" placeholder="Prioridad pecho, dorsal y deltoides" onInput=${(e) => setDraft({ ...draft, goal: e.target.value })} />
      </label>
      <label class="field"><span>¿Para quién es?</span>
        <select class="select" value=${dest} onChange=${(e) => setDest(e.target.value)}>
          <option value="">Solo guardarla como plantilla</option>
          ${people.map((p) => html`<option value=${p.id}>${p.name}</option>`)}
        </select>
      </label>
      ${dest && html`
        ${actives.length > 0 && html`<div class="banner"><${Icon} name="archive" /><span>Su rutina actual (<b>${actives[0].name}</b>) se archiva; su historial se conserva.</span></div>`}
        <button type="button" class=${`toggle-row ${alsoTemplate ? 'on' : ''}`} role="switch" aria-checked=${alsoTemplate} onClick=${() => setAlsoTemplate(!alsoTemplate)}>
          <span class="grow"><b>Guardar también como plantilla</b><small>Para asignársela a otros alumnos después</small></span>
          <span class="switch"><i></i></span>
        </button>`}

      ${draft.days.map((d, di) => html`<section key=${d.id} class="import-day">
        <div class="section-title">
          <h2>${d.name}${d.focus ? html` <span class="faint">· ${d.focus}</span>` : ''}</h2>
          <button class="mini-btn" aria-label=${`Quitar ${d.name}`} onClick=${() => removeDay(di)}><${Icon} name="trash" size="16" /></button>
        </div>
        ${d.notes && html`<p class="import-note">${d.notes}</p>`}
        <div class="slot-list">
          ${d.slots.map((s, si) => {
            const ex = exIndex.get(s.exId);
            const flag = !s.exId ? 'bad' : mod.current.needsReview(s) ? 'warn' : '';
            const showMatch = ex && ex.nameEs.toLowerCase() !== s.exName.toLowerCase();
            return html`<div class=${`slot ${flag ? `imp-${flag}` : ''}`} key=${s.id}>
              <button class="slot-main" onClick=${() => setEditing({ di, si })}>
                <span class="slot-n">${si + 1}</span>
                <span class="slot-thumb">${ex ? html`<${ExAnim} ex=${ex} size="thumb" />` : html`<span class="thumb-q">?</span>`}</span>
                <span class="grow">
                  <span class="slot-name">${s.exName}${s.ssGroup ? html` <span class="ss-badge">${s.ssGroup}</span>` : ''}</span>
                  ${showMatch && html`<span class="slot-match">→ ${ex.nameEs}</span>`}
                  <span class="slot-sum">${slotSummary(s)}</span>
                  ${flag === 'bad' && html`<span class="slot-warn bad"><${Icon} name="alert" size="14" />Elige el ejercicio</span>`}
                  ${flag === 'warn' && html`<span class="slot-warn"><${Icon} name="alert" size="14" />¿Es el correcto? Revísalo</span>`}
                  ${!flag && (s._import?.changed || s._import?.confirmed) && html`<span class="slot-ok"><${Icon} name="check" size="14" />Confirmado</span>`}
                </span>
              </button>
            </div>`;
          })}
        </div>
      </section>`)}

      ${draft.notes && html`<div class="section-title"><h2>Notas generales</h2></div><p class="import-note">${draft.notes}</p>`}
      <p class="hint mt">Series, reps, descansos y técnicas se cargan como vienen en el PDF. Al guardar se abre el editor para ajustar detalles${dest ? ' y poner la carga inicial' : ''}.</p>
    </div>

    <div class="save-bar"><div class="page">
      <button class="btn btn-primary btn-block" disabled=${busy || missing > 0 || (dest && routines.loading)} onClick=${save}>
        ${busy ? 'Guardando…' : saveLabel}
      </button>
    </div></div>

    ${cur && html`<${ImportSlotSheet} slot=${cur} exIndex=${exIndex}
      onRename=${(name) => patchSlot(editing.di, editing.si, { exName: name })}
      onConfirm=${() => { patchSlot(editing.di, editing.si, { _import: { confirmed: true } }); setEditing(null); }}
      onPick=${(ex) => pickEx(ex)} onSearch=${() => setPicker(true)}
      onRemove=${() => removeSlot(editing.di, editing.si)}
      onClose=${() => setEditing(null)} />`}
    <${ExercisePicker} open=${picker} title="Elegir ejercicio" onClose=${() => setPicker(false)}
      onPick=${(ex) => { pickEx(ex); setPicker(false); }} />
  </div>`;
}

function ImportSlotSheet({ slot, exIndex, onRename, onConfirm, onPick, onSearch, onRemove, onClose }) {
  const ex = exIndex.get(slot.exId);
  const imp = slot._import || {};
  const others = (imp.options || []).filter((id) => id !== slot.exId).map((id) => exIndex.get(id)).filter(Boolean).slice(0, 4);
  const doubtful = !slot.exId || (imp.level !== 'alta' && !imp.changed && !imp.confirmed);

  return html`<${Sheet} open=${true} onClose=${onClose} title="">
    <div class="import-src">
      <div class="eyebrow">En tu PDF</div>
      <div class="quote">${imp.srcName || slot.exName}</div>
    </div>

    <div class="eyebrow mt">Ejercicio del catálogo</div>
    ${ex ? html`<div class="slot-head" style="margin:8px 0 12px">
      <div class="slot-head-media"><${ExAnim} ex=${ex} size="thumb" /></div>
      <div class="grow" style="min-width:0">
        <div style="font-weight:800;font-size:17px;line-height:1.2">${ex.nameEs}</div>
        <div class="muted" style="font-size:13px">${primaryLabel(ex)}</div>
        <span class=${`lvl lvl-${imp.changed || imp.confirmed ? 'ok' : imp.level || 'baja'}`}>${imp.changed ? 'Elegido por ti' : imp.confirmed ? 'Confirmado' : LEVEL[imp.level] || 'Sin coincidencia'}</span>
      </div>
    </div>` : html`<div class="banner" style="margin:8px 0 12px"><${Icon} name="alert" />No encontré este ejercicio. Elige el más parecido.</div>`}

    <div class=${ex && doubtful ? 'two' : ''}>
      ${ex && doubtful && html`<button type="button" class="btn btn-primary" onClick=${onConfirm}><${Icon} name="check" />Sí, es este</button>`}
      <button type="button" class=${`btn ${ex ? '' : 'btn-primary btn-block'}`} onClick=${onSearch}><${Icon} name="search" />Buscar otro</button>
    </div>

    ${others.length > 0 && html`
      <div class="eyebrow mt-lg">${ex ? 'También podría ser' : 'Los más parecidos'}</div>
      <div class="list mt">${others.map((o) => html`<button class="row" key=${o.id} onClick=${() => onPick(o)}>
        <span class="slot-thumb" style="width:64px"><${ExAnim} ex=${o} size="thumb" /></span>
        <span class="grow"><div class="title">${o.nameEs}</div><div class="subtitle">${primaryLabel(o)}</div></span>
        <${Icon} name="swap" />
      </button>`)}</div>`}

    <label class="field mt-lg"><span>Nombre en la rutina (como lo verá el alumno)</span>
      <input class="input" maxlength="80" value=${slot.exName} onInput=${(e) => onRename(e.target.value)} />
    </label>
    <div class="import-read">
      <div><span class="faint">Prescripción</span>${slotSummary(slot)}</div>
      ${slot.alt && html`<div><span class="faint">Alternativa</span>${slot.alt}</div>`}
      ${slot.notes && html`<div><span class="faint">Notas</span>${slot.notes}</div>`}
    </div>

    <div class="two mt">
      <button type="button" class="btn btn-danger" onClick=${onRemove}><${Icon} name="trash" />Quitar</button>
      <button type="button" class="btn" onClick=${onClose}>Cerrar</button>
    </div>
  <//>`;
}
