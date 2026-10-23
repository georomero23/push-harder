import { html, useState, useEffect, useMemo, useRef } from '../lib/deps.js';
import { store, useStore } from '../lib/store.js';
import { go } from '../lib/router.js';
import { MUSCLE_GROUPS, EQUIPMENT, filterExercises, sortExercises, rankExercises, primaryLabel } from '../lib/catalog.js';
import { Icon, ExAnim, Topbar, Spinner, OfflineBanner } from '../lib/ui.js';

const PAGE = 36;

export function ExerciseCard({ ex, onClick }) {
  return html`<button class="ex-card" onClick=${onClick || (() => go(`/ej/${ex.id}`))}>
    <div style="position:relative">
      ${ex.src === 'custom' && html`<span class="badge">Propio</span>`}
      <${ExAnim} ex=${ex} size="thumb" />
    </div>
    <div class="meta">
      <div class="name">${ex.nameEs}</div>
      <div class="tags">${primaryLabel(ex)}</div>
    </div>
  </button>`;
}

export function Catalog() {
  const base = useStore((s) => s.catalog);
  const custom = useStore((s) => s.custom);
  const ui = useStore((s) => s.catalogUI);
  const isTrainer = useStore((s) => s.profile?.role === 'trainer');
  const loggedOut = useStore((s) => s.authState !== 'in');
  const [limit, setLimit] = useState(PAGE);
  const sentinel = useRef();

  const all = useMemo(() => sortExercises([...(base || []), ...custom]), [base, custom]);
  const list = useMemo(() => rankExercises(filterExercises(all, ui), ui.q), [all, ui]);
  const setUI = (patch) => { store.set({ catalogUI: { ...ui, ...patch } }); setLimit(PAGE); };

  // Render incremental: agrega más tarjetas al acercarse al final.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver !== 'function') return;
    const obs = new IntersectionObserver(([e]) => e.isIntersecting && setLimit((l) => l + PAGE), { rootMargin: '600px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [list.length > limit]);

  const equipmentUsed = useMemo(() => Object.keys(EQUIPMENT).filter((k) => all.some((e) => e.equipment === k)), [all]);

  return html`<div>
    <${Topbar} title="Catálogo" sub=${base ? `${all.length} ejercicios` : 'Cargando…'}
      actions=${isTrainer ? html`<button class="icon-btn" aria-label="Nuevo ejercicio propio" onClick=${() => go('/ejercicio/nuevo')}><${Icon} name="plus" /></button>`
        : loggedOut ? html`<button class="btn btn-sm btn-primary" onClick=${() => go('/')}>Entrar</button>` : null} />
    <div class="page">
      <${OfflineBanner} />
      <div class="search">
        <${Icon} name="search" />
        <input class="input" type="search" placeholder="Buscar: hip thrust, polea, glúteo…" value=${ui.q}
          onInput=${(e) => setUI({ q: e.target.value })} aria-label="Buscar ejercicio" />
      </div>
      <div class="chips" role="tablist" aria-label="Grupo muscular">
        <button class=${`chip mora ${ui.group === 'all' ? 'active' : ''}`} onClick=${() => setUI({ group: 'all' })}>Todos</button>
        ${MUSCLE_GROUPS.map((g) => html`<button class=${`chip mora ${ui.group === g.id ? 'active' : ''}`}
          onClick=${() => setUI({ group: ui.group === g.id ? 'all' : g.id })}>${g.label}</button>`)}
      </div>
      <div class="chips" aria-label="Equipo">
        <button class=${`chip ${ui.equipment === 'all' ? 'active' : ''}`} onClick=${() => setUI({ equipment: 'all' })}>Todo el equipo</button>
        ${equipmentUsed.map((k) => html`<button class=${`chip ${ui.equipment === k ? 'active' : ''}`}
          onClick=${() => setUI({ equipment: ui.equipment === k ? 'all' : k })}>${EQUIPMENT[k]}</button>`)}
      </div>

      ${!base ? html`<${Spinner} />` : html`
        <div class="count-line">${list.length} ${list.length === 1 ? 'resultado' : 'resultados'}</div>
        ${list.length === 0 ? html`<div class="empty"><b>Sin resultados</b>Prueba con otro nombre o quita filtros.</div>` : html`
          <div class="ex-grid">
            ${list.slice(0, limit).map((ex) => html`<${ExerciseCard} key=${ex.id} ex=${ex} />`)}
          </div>
          ${list.length > limit && html`<div ref=${sentinel} style="height:1px"></div>`}
        `}
      `}
    </div>
  </div>`;
}
