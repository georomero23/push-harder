// Biblioteca de plantillas del entrenador.
import { html } from '../lib/deps.js';
import { useStore } from '../lib/store.js';
import { go } from '../lib/router.js';
import { useWatch } from '../lib/hooks.js';
import { countSlots, nDays, nEx } from '../lib/routine.js';
import { Icon, Topbar, Spinner, OfflineBanner } from '../lib/ui.js';

export function Templates() {
  const profile = useStore((s) => s.profile);
  const tpls = useWatch((fb, ok, fail) => fb.watchTemplates(profile.id, ok, fail), [profile.id]);
  const list = (tpls.data || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return html`<div>
    <${Topbar} title="Rutinas" sub="Plantillas para asignar"
      actions=${html`<button class="icon-btn" aria-label="Nueva plantilla" onClick=${() => go('/plantilla/nueva')}><${Icon} name="plus" /></button>`} />
    <div class="page">
      <${OfflineBanner} />
      ${tpls.loading ? html`<${Spinner} />` : list.length === 0 ? html`
        <div class="card empty">
          <b>Arma tu primera plantilla</b>
          Crea la rutina una vez y asígnala a varios alumnos. Cada quien progresa con sus propias cargas.
          <div class="mt"><button class="btn btn-primary" onClick=${() => go('/plantilla/nueva')}><${Icon} name="plus" />Nueva plantilla</button></div>
        </div>` : html`
        <div class="list">
          ${list.map((t) => html`<button class="row" key=${t.id} onClick=${() => go(`/plantilla/${t.id}`)}>
            <span class="avatar" style="font-size:14px">${t.days?.length || 0}d</span>
            <span class="grow"><div class="title">${t.name}</div>
              <div class="subtitle">${nDays(t.days?.length || 0)} · ${nEx(countSlots(t))}${t.goal ? ` · ${t.goal}` : ''}</div></span>
            <${Icon} name="right" />
          </button>`)}
        </div>`}
      <p class="hint mt">Para asignar una plantilla: Alumnos → elige al alumno → Asignar rutina.</p>
    </div>
  </div>`;
}
