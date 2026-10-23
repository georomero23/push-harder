// Editor de rutinas: rutina → días → ejercicios con su prescripción.
// Modo 'template': biblioteca del entrenador (templates/{id}).
// Modo 'student': rutina asignada a un alumno (users/{sid}/routines/{rid}) + carga inicial por ejercicio.
import { html, useState, useEffect, useMemo } from '../lib/deps.js';
import { store, useStore, toast, friendlyError, committed } from '../lib/store.js';
import { go, back, replace } from '../lib/router.js';
import { useWatch, useExerciseIndex } from '../lib/hooks.js';
import { TECHNIQUES, TECHNIQUE_HINT, SS_GROUPS, REST_PRESETS, newDay, newSlot, clone, slotSummary, techniqueWarning, diffRoutines, fmtRest, emptyRoutine, rid, countSlots, nDays, nEx } from '../lib/routine.js';
import { defaultIncrement } from '../engine/increments.js';
import { variantsFor } from '../engine/progression.js';
import { fmtKg } from '../lib/session.js';
import { primaryLabel } from '../lib/catalog.js';
import { ExAnim, Topbar, Sheet, Icon, Spinner } from '../lib/ui.js';
import { ExercisePicker } from './picker.js';

const toDraft = (src) => ({ name: src?.name || '', goal: src?.goal || '', notes: src?.notes || '', days: clone(src?.days || []) });

export function RoutineEditor({ mode, tid, sid, routineId }) {
  const profile = useStore((s) => s.profile);
  const exIndex = useExerciseIndex();
  const isTemplate = mode === 'template';

  const tpl = useWatch((fb, ok, fail) => (isTemplate && tid ? fb.watchTemplate(tid, ok, fail) : ok(null)), [tid]);
  const routine = useWatch((fb, ok, fail) => (!isTemplate ? fb.watchRoutine(sid, routineId, ok, fail) : ok(null)), [sid, routineId]);
  const progress = useWatch((fb, ok, fail) => (!isTemplate ? fb.watchProgress(sid, routineId, ok, fail) : ok(null)), [sid, routineId]);
  const student = useWatch((fb, ok, fail) => (!isTemplate ? fb.watchUser(sid, ok, fail) : ok(null)), [sid]);

  const [draft, setDraft] = useState(null);
  const [orig, setOrig] = useState(null);
  const [loads, setLoads] = useState({});
  const [dayIdx, setDayIdx] = useState(0);
  const [editing, setEditing] = useState(null); // slotId
  const [picker, setPicker] = useState(null);   // { mode: 'add' } | { mode: 'replace', slotId }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (draft) return;
    if (isTemplate && !tid) { const d = emptyRoutine(); setDraft(d); setOrig(null); return; }
    const src = isTemplate ? tpl.data : routine.data;
    if (src) { const d = toDraft(src); setDraft(d); setOrig(clone(d)); }
  }, [tpl.data, routine.data]);

  const dirty = useMemo(() => draft && (JSON.stringify(draft) !== JSON.stringify(orig) || Object.keys(loads).length > 0), [draft, orig, loads]);

  const notFound = (isTemplate && tid && tpl.data === null) || (!isTemplate && routine.data === null);
  if (notFound) return html`<div><${Topbar} title="No encontrada" back /><div class="page empty"><b>Esta rutina no existe</b></div></div>`;
  if (!draft || (!isTemplate && progress.loading)) return html`<div><${Topbar} title="Rutina" back /><${Spinner} /></div>`;

  const day = draft.days[Math.min(dayIdx, draft.days.length - 1)];
  const setDays = (days) => setDraft({ ...draft, days });
  const updateDay = (patch) => setDays(draft.days.map((d) => (d.id === day.id ? { ...d, ...patch } : d)));
  const updateSlot = (slotId, patch) => updateDay({ slots: day.slots.map((s) => (s.id === slotId ? { ...s, ...patch } : s)) });
  const loadOf = (slotId) => (slotId in loads ? loads[slotId]?.loadKg : progress.data?.loads?.[slotId]?.loadKg ?? null);

  function moveSlot(i, dir) {
    const arr = [...day.slots];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    updateDay({ slots: arr });
  }
  function moveDay(dir) {
    const i = draft.days.indexOf(day);
    const j = i + dir;
    if (j < 0 || j >= draft.days.length) return;
    const arr = [...draft.days];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setDays(arr);
    setDayIdx(j);
  }
  function addDay() {
    setDays([...draft.days, newDay(draft.days.length)]);
    setDayIdx(draft.days.length);
  }
  function duplicateDay() {
    const copy = { ...clone(day), id: rid('d'), name: `${day.name} (copia)` };
    copy.slots = copy.slots.map((s) => ({ ...s, id: rid('s') }));
    const i = draft.days.indexOf(day);
    const arr = [...draft.days];
    arr.splice(i + 1, 0, copy);
    setDays(arr);
    setDayIdx(i + 1);
  }
  function deleteDay() {
    if (draft.days.length === 1) { toast('La rutina necesita al menos un día', 'bad'); return; }
    if (day.slots.length && !window.confirm(`¿Eliminar ${day.name} y sus ${day.slots.length} ejercicios?`)) return;
    setDays(draft.days.filter((d) => d.id !== day.id));
    setDayIdx(Math.max(0, dayIdx - 1));
  }
  function onPick(ex) {
    if (picker?.mode === 'replace') {
      updateSlot(picker.slotId, { exId: ex.id, src: ex.src || 'base', exName: ex.nameEs, incrementKg: null });
      if (!isTemplate) setLoads({ ...loads, [picker.slotId]: { loadKg: null } });
    } else {
      const s = newSlot(ex);
      updateDay({ slots: [...day.slots, s] });
      setEditing(s.id);
    }
    setPicker(null);
  }

  async function save() {
    if (!draft.name.trim()) { toast('Ponle nombre a la rutina', 'bad'); return; }
    if (draft.days.some((d) => d.slots.some((s) => s.repMin > s.repMax))) { toast('Revisa los rangos: el mínimo no puede ser mayor que el máximo', 'bad'); return; }
    setBusy(true);
    const fb = store.get().fb;
    const data = { name: draft.name.trim(), goal: draft.goal.trim(), notes: draft.notes.trim(), days: draft.days };
    try {
      if (isTemplate) {
        const id = tid || fb.newId('templates');
        const res = await committed(fb.saveTemplate(id, { ...data, trainerId: profile.id }, !tid));
        setOrig(clone(draft));
        toast(res === 'queued' ? 'Guardada sin conexión; se sincroniza sola' : 'Plantilla guardada');
        if (!tid) replace(`/plantilla/${id}`);
      } else {
        const summary = diffRoutines(orig, draft);
        const nameOf = (slotId) => draft.days.flatMap((d) => d.slots).find((s) => s.id === slotId)?.exName || 'Ejercicio';
        for (const [slotId, v] of Object.entries(loads)) {
          const before = progress.data?.loads?.[slotId]?.loadKg ?? null;
          if (before !== (v?.loadKg ?? null)) summary.push(`${nameOf(slotId)}: carga ${fmtKg(before)} → ${fmtKg(v?.loadKg)} kg`);
        }
        const res = await committed(fb.saveRoutine({ sid, rid: routineId, data, version: routine.data.version, byUid: profile.id, summary, loads }));
        setOrig(clone(draft));
        setLoads({});
        toast(res === 'queued' ? 'Guardada sin conexión; se sincroniza sola' : 'Rutina guardada');
      }
    } catch (e) {
      toast(friendlyError(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  const leave = () => { if (!dirty || window.confirm('Tienes cambios sin guardar. ¿Salir sin guardar?')) back(isTemplate ? '/rutinas' : `/alumno/${sid}`); };
  const editingSlot = editing && day.slots.find((s) => s.id === editing);

  return html`<div>
    <${Topbar} back onBack=${leave} eyebrow=${isTemplate ? 'Plantilla' : `Rutina de ${student.data?.name || ''}`}
      title=${draft.name || (isTemplate ? 'Nueva plantilla' : 'Rutina')}
      actions=${html`<button class="btn btn-sm btn-primary" disabled=${!dirty || busy} onClick=${save}>${busy ? '…' : 'Guardar'}</button>`} />
    <div class="page editor">
      <label class="field"><span>Nombre</span>
        <input class="input" value=${draft.name} maxlength="60" placeholder="Hipertrofia 5 días · V9" onInput=${(e) => setDraft({ ...draft, name: e.target.value })} />
      </label>
      <label class="field"><span>Objetivo (opcional)</span>
        <input class="input" value=${draft.goal} maxlength="90" placeholder="Prioridad pecho, dorsal y deltoides" onInput=${(e) => setDraft({ ...draft, goal: e.target.value })} />
      </label>

      <div class="section-title"><h2>Días · ${draft.days.length}</h2><span class="faint" style="font-size:13px">${nEx(countSlots(draft))}</span></div>
      <div class="chips">
        ${draft.days.map((d, i) => html`<button class=${`chip mora ${d.id === day.id ? 'active' : ''}`} onClick=${() => setDayIdx(i)}>${d.name || `Día ${i + 1}`}</button>`)}
        <button class="chip" onClick=${addDay}>+ Día</button>
      </div>

      <div class="card mt day-card">
        <div class="two">
          <label class="field"><span>Nombre del día</span>
            <input class="input" value=${day.name} maxlength="30" onInput=${(e) => updateDay({ name: e.target.value })} />
          </label>
          <label class="field"><span>Enfoque</span>
            <input class="input" value=${day.focus} maxlength="40" placeholder="Pecho y espalda" onInput=${(e) => updateDay({ focus: e.target.value })} />
          </label>
        </div>
        <label class="field"><span>Nota del entrenador para este día (sale en el PDF)</span>
          <textarea class="textarea" maxlength="320" value=${day.notes || ''} placeholder="Día pesado de cuádriceps: hack y búlgara van limpios; la intensidad va en la prensa…" onInput=${(e) => updateDay({ notes: e.target.value })}></textarea>
        </label>
        <div class="row-gap" style="justify-content:flex-end">
          <button class="icon-btn" aria-label="Mover día a la izquierda" onClick=${() => moveDay(-1)}><${Icon} name="back" /></button>
          <button class="icon-btn" aria-label="Mover día a la derecha" onClick=${() => moveDay(1)}><${Icon} name="right" /></button>
          <button class="icon-btn" aria-label="Duplicar día" onClick=${duplicateDay}><${Icon} name="copy" /></button>
          <button class="icon-btn danger" aria-label="Eliminar día" onClick=${deleteDay}><${Icon} name="trash" /></button>
        </div>
      </div>

      <div class="slot-list mt">
        ${day.slots.length === 0 && html`<div class="empty"><b>Sin ejercicios</b>Agrega el primero del catálogo.</div>`}
        ${day.slots.map((s, i) => {
          const ex = exIndex.get(s.exId);
          const load = !isTemplate ? loadOf(s.id) : undefined;
          const warn = techniqueWarning(s, ex);
          const flag = !isTemplate && progress.data?.flags?.[s.id];
          return html`<div class="slot" key=${s.id}>
            <button class="slot-main" onClick=${() => setEditing(s.id)}>
              <span class="slot-n">${i + 1}</span>
              <span class="slot-thumb">${ex ? html`<${ExAnim} ex=${ex} size="thumb" />` : html`<span class="faint">?</span>`}</span>
              <span class="grow">
                <span class="slot-name">${s.exName}${s.ssGroup ? html` <span class="ss-badge">${s.ssGroup}</span>` : ''}</span>
                <span class="slot-sum">${slotSummary(s)}</span>
                ${!isTemplate && html`<span class="slot-load">${load != null ? `Carga: ${fmtKg(load)} kg` : 'Sin carga inicial'}</span>`}
                ${flag && html`<span class="slot-warn"><${Icon} name="flag" size="14" />Molestia reportada</span>`}
                ${warn && html`<span class="slot-warn"><${Icon} name="alert" size="14" />${warn}</span>`}
                ${!ex && html`<span class="slot-warn">Ejercicio no disponible</span>`}
              </span>
            </button>
            <div class="slot-move">
              <button class="mini-btn" aria-label="Subir" disabled=${i === 0} onClick=${() => moveSlot(i, -1)}><${Icon} name="up" size="18" /></button>
              <button class="mini-btn" aria-label="Bajar" disabled=${i === day.slots.length - 1} onClick=${() => moveSlot(i, 1)}><${Icon} name="down" size="18" /></button>
            </div>
          </div>`;
        })}
      </div>
      <button class="btn btn-block mt" onClick=${() => setPicker({ mode: 'add' })}><${Icon} name="plus" />Agregar ejercicio a ${day.name}</button>

      <label class="field mt-lg"><span>Notas generales (opcional)</span>
        <textarea class="textarea" maxlength="500" placeholder="Calentamiento, cardio, indicaciones…" value=${draft.notes} onInput=${(e) => setDraft({ ...draft, notes: e.target.value })}></textarea>
      </label>
      ${dirty && html`<div class="save-bar"><div class="page"><button class="btn btn-primary btn-block" disabled=${busy} onClick=${save}>${busy ? 'Guardando…' : 'Guardar cambios'}</button></div></div>`}
    </div>

    ${editingSlot && html`<${SlotSheet}
      slot=${editingSlot} ex=${exIndex.get(editingSlot.exId)} isTemplate=${isTemplate}
      load=${loadOf(editingSlot.id)} onLoad=${(v) => setLoads({ ...loads, [editingSlot.id]: { loadKg: v } })}
      onChange=${(patch) => updateSlot(editingSlot.id, patch)}
      onReplace=${() => setPicker({ mode: 'replace', slotId: editingSlot.id })}
      onDelete=${() => { updateDay({ slots: day.slots.filter((s) => s.id !== editingSlot.id) }); setEditing(null); }}
      onClose=${() => setEditing(null)} />`}
    <${ExercisePicker} open=${!!picker} title=${picker?.mode === 'replace' ? 'Cambiar ejercicio' : 'Agregar ejercicio'}
      onClose=${() => setPicker(null)} onPick=${onPick} />
  </div>`;
}

// ---------- Hoja de edición de un ejercicio ----------
function Stepper({ value, min = 0, max = 99, step = 1, onChange, label, fmt = (v) => v }) {
  const set = (v) => onChange(Math.min(max, Math.max(min, v)));
  return html`<div class="stepper" role="group" aria-label=${label}>
    <button type="button" aria-label=${`Menos ${label}`} onClick=${() => set(value - step)} disabled=${value <= min}>−</button>
    <output>${fmt(value)}</output>
    <button type="button" aria-label=${`Más ${label}`} onClick=${() => set(value + step)} disabled=${value >= max}>+</button>
  </div>`;
}

function SlotSheet({ slot, ex, isTemplate, load, onLoad, onChange, onReplace, onDelete, onClose }) {
  const t = slot.technique?.type || 'none';
  const catalog = useStore((s) => [...(s.catalog || []), ...s.custom]);
  const altSuggestion = variantsFor(ex, catalog, 2).map((e, i) => (i ? e.nameEs.toLowerCase() : e.nameEs)).join(' o ');
  const warn = techniqueWarning(slot, ex);
  const setTech = (patch) => onChange({ technique: { ...slot.technique, ...patch } });
  const pickTech = (type) => {
    const patch = { technique: { ...slot.technique, type } };
    if (type === 'superset') patch.ssGroup = slot.ssGroup || 'A';
    else patch.ssGroup = null;
    onChange(patch);
  };
  const fst7 = () => onChange({ sets: 7, repMin: 10, repMax: 12, restSec: 40 });

  return html`<${Sheet} open=${true} onClose=${onClose} title="">
    <div class="slot-head">
      <div class="slot-head-media">${ex && html`<${ExAnim} ex=${ex} size="thumb" />`}</div>
      <div class="grow" style="min-width:0">
        <div class="eyebrow">${ex ? primaryLabel(ex) : ''}</div>
        <div style="font-weight:800;font-size:18px;line-height:1.2">${slot.exName}</div>
        <button type="button" class="link-btn" onClick=${onReplace}><${Icon} name="swap" size="16" /> Cambiar ejercicio</button>
      </div>
    </div>

    <div class="grid-fields">
      <div class="field"><span>Series</span><${Stepper} label="series" value=${slot.sets} min=${1} max=${10} onChange=${(v) => onChange({ sets: v })} /></div>
      <div class="field"><span>RIR objetivo</span>
        <div class="seg">${[0, 1, 2, 3, 4].map((r) => html`<button type="button" class=${slot.rir === r ? 'on' : ''} onClick=${() => onChange({ rir: r })}>${r}</button>`)}</div>
      </div>
      <div class="field"><span>Reps mínimo</span><${Stepper} label="reps mínimo" value=${slot.repMin} min=${1} max=${50} onChange=${(v) => onChange({ repMin: v, repMax: Math.max(v, slot.repMax) })} /></div>
      <div class="field"><span>Reps máximo</span><${Stepper} label="reps máximo" value=${slot.repMax} min=${1} max=${50} onChange=${(v) => onChange({ repMax: v, repMin: Math.min(v, slot.repMin) })} /></div>
    </div>

    <div class="field"><span>Descanso · ${fmtRest(slot.restSec)}</span>
      <div class="chips wrap">
        ${REST_PRESETS.map((r) => html`<button type="button" class=${`chip ${slot.restSec === r ? 'active' : ''}`} onClick=${() => onChange({ restSec: r })}>${fmtRest(r)}</button>`)}
        <${Stepper} label="descanso" value=${slot.restSec} min=${15} max=${600} step=${15} fmt=${(v) => `${v}s`} onChange=${(v) => onChange({ restSec: v })} />
      </div>
    </div>

    <div class="field"><span>Técnica de intensidad</span>
      <div class="chips wrap">
        ${Object.entries(TECHNIQUES).map(([k, v]) => html`<button type="button" class=${`chip mora ${t === k ? 'active' : ''}`} onClick=${() => pickTech(k)}>${v}</button>`)}
      </div>
      ${t !== 'none' && html`<p class="hint">${TECHNIQUE_HINT[t]}</p>`}
    </div>
    ${t === 'superset' && html`<div class="field"><span>Grupo de superserie (se alterna con los del mismo grupo en el día)</span>
      <div class="seg">${SS_GROUPS.map((g) => html`<button type="button" class=${slot.ssGroup === g ? 'on' : ''} onClick=${() => onChange({ ssGroup: g })}>${g}</button>`)}</div>
    </div>`}
    ${!['none', 'superset', 'fst7'].includes(t) && html`<div class="field"><span>Aplicar en</span>
      <div class="seg">
        <button type="button" class=${slot.technique.applyTo !== 'all' ? 'on' : ''} onClick=${() => setTech({ applyTo: 'last' })}>Última serie</button>
        <button type="button" class=${slot.technique.applyTo === 'all' ? 'on' : ''} onClick=${() => setTech({ applyTo: 'all' })}>Todas</button>
      </div>
    </div>`}
    ${t === 'fst7' && slot.sets !== 7 && html`<button type="button" class="btn btn-sm" onClick=${fst7}>Aplicar 7 × 10–12 · 40 s</button>`}
    ${t !== 'none' && t !== 'superset' && html`<label class="field mt"><span>Detalle (opcional)</span>
      <input class="input" maxlength="80" value=${slot.technique.detail || ''} placeholder=${t === 'drop' ? '2 drops de −20 %' : t === 'eccentric' ? '4 s bajando' : ''} onInput=${(e) => setTech({ detail: e.target.value })} />
    </label>`}
    ${warn && html`<div class="banner"><${Icon} name="alert" />${warn}</div>`}

    <div class="grid-fields">
      ${!isTemplate && html`<label class="field"><span>Carga actual (kg)</span>
        <input class="input" type="number" inputmode="decimal" step="0.5" min="0" value=${load ?? ''} placeholder="—"
          onInput=${(e) => onLoad(e.target.value === '' ? null : Number(e.target.value))} />
      </label>`}
      <label class="field"><span>Incremento (kg)</span>
        <input class="input" type="number" inputmode="decimal" step="0.5" min="0" value=${slot.incrementKg ?? ''}
          placeholder=${`${defaultIncrement(ex)} sugerido`} onInput=${(e) => onChange({ incrementKg: e.target.value === '' ? null : Number(e.target.value) })} />
      </label>
    </div>
    ${!isTemplate && html`<p class="hint" style="margin-top:-6px">La carga actual es con la que arranca. Después solo cambia con una propuesta aprobada.</p>`}

    <label class="field"><span>Notas para el alumno</span>
      <textarea class="textarea" maxlength="240" value=${slot.notes} placeholder="Pausa de 1 s abajo, agarre neutro…" onInput=${(e) => onChange({ notes: e.target.value })}></textarea>
    </label>
    <label class="field"><span>Alternativa (sale en el PDF)</span>
      <input class="input" maxlength="90" value=${slot.alt || ''} placeholder=${altSuggestion || 'Si el equipo está ocupado…'} onInput=${(e) => onChange({ alt: e.target.value })} />
      <p class="hint">Vacío = la app sugiere variantes del mismo patrón.</p>
    </label>

    <div class="two mt">
      <button type="button" class="btn btn-danger" onClick=${onDelete}><${Icon} name="trash" />Quitar</button>
      <button type="button" class="btn btn-primary" onClick=${onClose}><${Icon} name="check" />Listo</button>
    </div>
  <//>`;
}
