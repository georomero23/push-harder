// Alta / edición de ejercicios propios del entrenador.
// La animación vive en el repo (media/custom/…) o en una URL: la app nunca sube archivos,
// así no hace falta ningún token ni Firebase Storage (que pide plan de pago).
import { html, useState, useEffect, useMemo } from '../lib/deps.js';
import { store, useStore, toast, friendlyError, committed } from '../lib/store.js';
import { go } from '../lib/router.js';
import { MUSCLES, EQUIPMENT, PATTERNS, REGIONS, MECHANICS, REGION_BY_PATTERN, slugify } from '../lib/catalog.js';
import { ExAnim, Topbar, Icon, Spinner } from '../lib/ui.js';

const EMPTY = {
  nameEs: '', aliases: '', pattern: 'otro', region: 'superior', equipment: 'maquina', mechanic: 'aislamiento',
  primary: [], secondary: [], cues: ['', '', ''], mediaKind: 'repo', mediaSrc: '',
};

function MuscleChips({ value, onChange, exclude = [] }) {
  return html`<div class="chips wrap">
    ${Object.entries(MUSCLES).filter(([k]) => !exclude.includes(k)).map(([k, label]) => html`
      <button type="button" class=${`chip ${value.includes(k) ? 'active' : ''}`}
        onClick=${() => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k])}>${label}</button>`)}
  </div>`;
}

export function CustomExerciseForm({ id }) {
  const profile = useStore((s) => s.profile);
  const custom = useStore((s) => s.custom);
  const existing = id ? custom.find((e) => e.id === id) : null;
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) { setF(EMPTY); return; }
    if (existing) {
      setF({
        ...EMPTY, ...existing,
        aliases: (existing.aliases || []).join(', '),
        cues: [...(existing.cues || []), '', '', ''].slice(0, 3),
        mediaKind: existing.media?.kind || 'repo',
        mediaSrc: existing.media?.kind === 'repo' ? (existing.media.src || '').replace(/^media\/custom\//, '') : existing.media?.src || '',
      });
    }
  }, [id, !!existing]);

  const mediaUrl = f ? (f.mediaKind === 'repo' ? (f.mediaSrc ? `media/custom/${f.mediaSrc.replace(/^\/+/, '')}` : '') : f.mediaSrc.trim()) : '';
  const preview = useMemo(() => ({ id: `preview-${mediaUrl}`, nameEs: f?.nameEs || 'Vista previa', src: 'custom', media: { src: mediaUrl } }), [mediaUrl]);

  if (id && !existing) return html`<div><${Topbar} title="Editar" back backTo="/catalogo" />${custom.length ? html`<div class="page empty"><b>No encontrado</b></div>` : html`<${Spinner} />`}</div>`;
  if (!f) return html`<${Spinner} />`;

  const set = (patch) => setF({ ...f, ...patch });
  const cues = f.cues.map((c) => c.trim()).filter(Boolean);
  const valid = f.nameEs.trim().length >= 3 && f.primary.length > 0 && cues.length >= 2 && mediaUrl;

  async function save(e) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setError('');
    const exId = id || `c-${slugify(f.nameEs)}-${Math.random().toString(36).slice(2, 6)}`;
    const data = {
      ownerId: profile.id,
      nameEs: f.nameEs.trim(),
      aliases: f.aliases.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6),
      pattern: f.pattern, region: f.region, equipment: f.equipment, mechanic: f.mechanic,
      primary: f.primary, secondary: f.secondary.filter((m) => !f.primary.includes(m)),
      cues: cues.slice(0, 3).map((c) => c.slice(0, 80)),
      media: { kind: f.mediaKind, src: mediaUrl },
    };
    try {
      const fb = store.get().fb;
      const res = await committed(fb.saveCustomExercise(exId, data, !id));
      const item = { ...data, id: exId, src: 'custom' };
      store.set((s) => ({ custom: [...s.custom.filter((x) => x.id !== exId), item] }));
      toast(res === 'queued' ? 'Guardado sin conexión; se sincroniza al volver la señal' : 'Ejercicio guardado');
      go(`/ej/${exId}`);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirmDelete()) return;
    setBusy(true);
    try {
      await committed(store.get().fb.deleteCustomExercise(id));
      store.set((s) => ({ custom: s.custom.filter((x) => x.id !== id) }));
      toast('Ejercicio eliminado');
      go('/catalogo');
    } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
  }

  return html`<div>
    <${Topbar} title=${id ? 'Editar ejercicio' : 'Nuevo ejercicio'} back backTo="/catalogo" />
    <form class="page" onSubmit=${save}>
      ${error && html`<div class="error-box">${error}</div>`}

      <div class="section-title" style="margin-top:6px"><h2>Animación</h2></div>
      <div class="chips wrap" style="margin-bottom:12px">
        <button type="button" class=${`chip ${f.mediaKind === 'repo' ? 'active' : ''}`} onClick=${() => set({ mediaKind: 'repo', mediaSrc: '' })}>Archivo en el repo</button>
        <button type="button" class=${`chip ${f.mediaKind === 'url' ? 'active' : ''}`} onClick=${() => set({ mediaKind: 'url', mediaSrc: '' })}>URL</button>
      </div>
      ${f.mediaKind === 'repo' ? html`
        <label class="field"><span>Nombre del archivo en media/custom/</span>
          <input class="input" value=${f.mediaSrc} onInput=${(e) => set({ mediaSrc: e.target.value.trim() })} placeholder="hip-thrust-maquina.mp4" autocapitalize="off" spellcheck="false" />
          <p class="hint">Súbelo antes en GitHub: carpeta media/custom → Add file → Upload files. MP4 o WebP pesan mucho menos que GIF.</p>
        </label>` : html`
        <label class="field"><span>URL de la animación (GIF, WebP o MP4)</span>
          <input class="input" type="url" value=${f.mediaSrc} onInput=${(e) => set({ mediaSrc: e.target.value })} placeholder="https://…" autocapitalize="off" spellcheck="false" />
        </label>`}
      ${mediaUrl && html`<div class="media-preview"><${ExAnim} key=${mediaUrl} ex=${preview} eager /></div>`}

      <div class="section-title"><h2>Datos</h2></div>
      <label class="field"><span>Nombre (como se dice en el gym)</span>
        <input class="input" required maxlength="70" value=${f.nameEs} onInput=${(e) => set({ nameEs: e.target.value })} placeholder="Hip thrust en máquina" />
      </label>
      <label class="field"><span>Otros nombres (separados por coma)</span>
        <input class="input" value=${f.aliases} onInput=${(e) => set({ aliases: e.target.value })} placeholder="empuje de cadera, glute drive" />
      </label>
      <label class="field"><span>Patrón de movimiento</span>
        <select class="select" value=${f.pattern} onChange=${(e) => set({ pattern: e.target.value, region: REGION_BY_PATTERN(e.target.value) })}>
          ${Object.entries(PATTERNS).map(([k, v]) => html`<option value=${k}>${v}</option>`)}
        </select>
        <p class="hint">Lo usa el motor para sugerir variantes y sustitutos.</p>
      </label>
      <div class="two">
        <label class="field"><span>Equipo</span>
          <select class="select" value=${f.equipment} onChange=${(e) => set({ equipment: e.target.value })}>
            ${Object.entries(EQUIPMENT).map(([k, v]) => html`<option value=${k}>${v}</option>`)}
          </select>
        </label>
        <label class="field"><span>Tipo</span>
          <select class="select" value=${f.mechanic} onChange=${(e) => set({ mechanic: e.target.value })}>
            ${Object.entries(MECHANICS).map(([k, v]) => html`<option value=${k}>${v}</option>`)}
          </select>
        </label>
      </div>
      <label class="field"><span>Zona (define el incremento de carga: superior +2.5 kg, inferior +5 kg)</span>
        <select class="select" value=${f.region} onChange=${(e) => set({ region: e.target.value })}>
          ${Object.entries(REGIONS).map(([k, v]) => html`<option value=${k}>${v}</option>`)}
        </select>
      </label>

      <div class="section-title"><h2>Músculo principal</h2></div>
      <${MuscleChips} value=${f.primary} onChange=${(v) => set({ primary: v, secondary: f.secondary.filter((m) => !v.includes(m)) })} />
      <div class="section-title"><h2>Secundarios</h2></div>
      <${MuscleChips} value=${f.secondary} exclude=${f.primary} onChange=${(v) => set({ secondary: v })} />

      <div class="section-title"><h2>Indicaciones técnicas (2–3)</h2></div>
      ${f.cues.map((c, i) => html`<label class="field"><span class="sr-only">Indicación ${i + 1}</span>
        <input class="input" maxlength="80" value=${c} placeholder=${['Espalda alta apoyada en el respaldo', 'Empuja con talones hasta extender cadera', 'Aprieta glúteo 1 s arriba'][i]}
          onInput=${(e) => { const n = [...f.cues]; n[i] = e.target.value; set({ cues: n }); }} />
      </label>`)}

      <button class="btn btn-primary btn-block mt" disabled=${busy || !valid}>${busy ? 'Guardando…' : 'Guardar ejercicio'}</button>
      ${!valid && html`<p class="hint center">Falta: ${[!mediaUrl && 'animación', f.nameEs.trim().length < 3 && 'nombre', !f.primary.length && 'músculo principal', cues.length < 2 && '2 indicaciones'].filter(Boolean).join(', ')}</p>`}
      ${id && html`<button type="button" class="btn btn-danger btn-block mt" disabled=${busy} onClick=${remove}><${Icon} name="trash" />Eliminar ejercicio</button>`}
    </form>
  </div>`;
}

function confirmDelete() {
  // eslint-disable-next-line no-alert
  return window.confirm('¿Eliminar este ejercicio? Las rutinas que lo usen mostrarán "ejercicio no disponible".');
}
