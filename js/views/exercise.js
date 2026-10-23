import { html, useState, useEffect, useMemo } from '../lib/deps.js';
import { store, useStore } from '../lib/store.js';
import { go } from '../lib/router.js';
import { EQUIPMENT, PATTERNS, MECHANICS, REGIONS, muscleLabel, variantsOf } from '../lib/catalog.js';
import { ExAnim, Topbar, Spinner, Icon } from '../lib/ui.js';
import { ExerciseCard } from './catalog.js';

export function ExerciseDetail({ id }) {
  const base = useStore((s) => s.catalog);
  const custom = useStore((s) => s.custom);
  const authState = useStore((s) => s.authState);
  const profile = useStore((s) => s.profile);
  const [remote, setRemote] = useState(undefined);

  const all = useMemo(() => [...(base || []), ...custom], [base, custom]);
  const local = all.find((e) => e.id === id);

  // Ejercicio propio abierto desde un QR sin sesión: se lee directo de Firestore (lectura pública).
  useEffect(() => {
    if (local || !base || remote !== undefined) return;
    const fb = store.get().fb;
    if (!fb) { setRemote(null); return; }
    fb.getCustomExercise(id).then(setRemote).catch(() => setRemote(null));
  }, [local, base, id, store.get().fb]);

  const ex = local || remote;
  if (!base || (!ex && remote === undefined)) return html`<div><${Topbar} title="" back backTo="/catalogo" /><${Spinner} /></div>`;
  if (!ex) {
    return html`<div><${Topbar} title="No encontrado" back backTo="/catalogo" />
      <div class="page"><div class="empty"><b>Ese ejercicio no existe</b>Quizá lo borraron o el enlace está incompleto.</div></div></div>`;
  }

  const variants = variantsOf(ex, all, 10);
  const canEdit = ex.src === 'custom' && profile?.role === 'trainer' && ex.ownerId === profile.id;
  const loggedOut = authState !== 'in';

  return html`<div>
    <${Topbar} eyebrow=${PATTERNS[ex.pattern] || ''} title="" back backTo="/catalogo"
      actions=${canEdit && html`<button class="icon-btn" aria-label="Editar" onClick=${() => go(`/ejercicio/editar/${ex.id}`)}><${Icon} name="edit" /></button>`} />
    <div class="page">
      <div class="hero"><${ExAnim} key=${ex.id} ex=${ex} eager interval=${900} /></div>
      <h2 class="hero-title">${ex.nameEs}</h2>
      ${ex.aliases?.length > 0 && html`<div class="faint" style="font-size:13.5px">También: ${ex.aliases.join(' · ')}</div>`}

      <div class="facts">
        <div class="fact"><small>Equipo</small><b>${EQUIPMENT[ex.equipment] || '—'}</b></div>
        <div class="fact"><small>Tipo</small><b>${MECHANICS[ex.mechanic] || '—'}</b></div>
        <div class="fact"><small>Zona</small><b>${REGIONS[ex.region] || '—'}</b></div>
      </div>

      <div class="section-title"><h2>Músculos</h2></div>
      <div class="muscles">
        ${(ex.primary || []).map((m) => html`<span class="pill primary">${muscleLabel(m)}</span>`)}
        ${(ex.secondary || []).map((m) => html`<span class="pill secondary">${muscleLabel(m)}</span>`)}
      </div>

      ${ex.cues?.length > 0 && html`
        <div class="section-title"><h2>Técnica</h2></div>
        <ol class="cues">${ex.cues.map((c) => html`<li>${c}</li>`)}</ol>
      `}

      ${variants.length > 0 && html`
        <div class="section-title"><h2>Variantes · ${PATTERNS[ex.pattern]}</h2></div>
        <div class="hscroll">${variants.map((v) => html`<${ExerciseCard} key=${v.id} ex=${v} />`)}</div>
      `}

      ${loggedOut && html`<div class="card mt-lg center">
        <div class="eyebrow">PUSH HARDER</div>
        <p class="muted" style="margin:8px 0 14px">Rutinas, registro y progresión con tu entrenador.</p>
        <button class="btn btn-primary btn-block" onClick=${() => go('/')}>Entrar</button>
      </div>`}
    </div>
  </div>`;
}
