// Selector de ejercicio a pantalla completa (para el editor de rutinas).
import { html, useState, useMemo, useEffect, useRef } from '../lib/deps.js';
import { useStore } from '../lib/store.js';
import { MUSCLE_GROUPS, filterExercises, sortExercises, rankExercises } from '../lib/catalog.js';
import { Icon } from '../lib/ui.js';
import { ExerciseCard } from './catalog.js';

export function ExercisePicker({ open, onClose, onPick, title = 'Elegir ejercicio', initialGroup = 'all' }) {
  const base = useStore((s) => s.catalog);
  const custom = useStore((s) => s.custom);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState(initialGroup);
  const [limit, setLimit] = useState(30);
  const sentinel = useRef();
  const all = useMemo(() => sortExercises([...(base || []), ...custom]), [base, custom]);
  const list = useMemo(() => rankExercises(filterExercises(all, { q, group }), q), [all, q, group]);

  useEffect(() => { if (open) { setQ(''); setGroup(initialGroup); setLimit(30); } }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; removeEventListener('keydown', onKey); };
  }, [open]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return undefined;
    const obs = new IntersectionObserver(([e]) => e.isIntersecting && setLimit((l) => l + 30), { root: el.closest('.picker'), rootMargin: '400px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [open, list.length > limit]);

  if (!open) return null;
  return html`<div class="picker" role="dialog" aria-modal="true" aria-label=${title}>
    <div class="picker-head">
      <div class="page">
        <div class="topbar-in">
          <button class="icon-btn" aria-label="Cerrar" onClick=${onClose}><${Icon} name="close" /></button>
          <h1 style="flex:1;margin:0;font-family:var(--display);font-weight:400;font-size:22px;text-transform:uppercase">${title}</h1>
        </div>
        <div class="search mt">
          <${Icon} name="search" />
          <input class="input" type="search" placeholder="Buscar ejercicio…" value=${q} onInput=${(e) => { setQ(e.target.value); setLimit(30); }} autofocus />
        </div>
        <div class="chips">
          <button class=${`chip mora ${group === 'all' ? 'active' : ''}`} onClick=${() => setGroup('all')}>Todos</button>
          ${MUSCLE_GROUPS.map((g) => html`<button class=${`chip mora ${group === g.id ? 'active' : ''}`} onClick=${() => { setGroup(group === g.id ? 'all' : g.id); setLimit(30); }}>${g.label}</button>`)}
        </div>
      </div>
    </div>
    <div class="page" style="padding-bottom:40px">
      <div class="count-line">${list.length} ejercicios</div>
      <div class="ex-grid">
        ${list.slice(0, limit).map((ex) => html`<${ExerciseCard} key=${ex.id} ex=${ex} onClick=${() => onPick(ex)} />`)}
      </div>
      ${list.length > limit && html`<div ref=${sentinel} style="height:1px"></div>`}
    </div>
  </div>`;
}
