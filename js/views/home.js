import { html } from '../lib/deps.js';
import { useStore } from '../lib/store.js';
import { go } from '../lib/router.js';
import { Icon, OfflineBanner } from '../lib/ui.js';
import { MyTraining } from './today.js';
import { InstallCard } from './offline.js';

function Tile({ icon, title, sub, to, soon }) {
  return html`<button class=${`tile ${soon ? 'soon' : ''}`} onClick=${() => !soon && go(to)} disabled=${soon}>
    <span class="ico"><${Icon} name=${icon} /></span>
    <span><b>${title}</b><br /><small>${sub}</small></span>
  </button>`;
}

export function Home() {
  const profile = useStore((s) => s.profile);
  const count = useStore((s) => (s.catalog?.length || 0) + s.custom.length);
  const first = (profile?.name || '').split(' ')[0] || 'atleta';
  const isTrainer = profile?.role === 'trainer';
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  return html`<div class="page" style="padding-top:calc(var(--safe-t) + 18px)">
    <${OfflineBanner} />
    <${InstallCard} compact />
    <section class="welcome">
      <div class="eyebrow">${greet}</div>
      <h2>${first}</h2>
      <p>${isTrainer ? 'Panel de entrenador' : 'Listo para entrenar'}</p>
    </section>

    ${isTrainer ? html`
      <div class="section-title"><h2>Tu equipo</h2></div>
      <div class="tiles">
        <${Tile} icon="users" title="Alumnos" sub="Altas y estado" to="/alumnos" />
        <${Tile} icon="dumbbell" title="Catálogo" sub=${`${count} ejercicios`} to="/catalogo" />
        <${Tile} icon="plus" title="Ejercicio propio" sub="Con tu GIF o video" to="/ejercicio/nuevo" />
        <${Tile} icon="calendar" title="Rutinas" sub="Plantillas" to="/rutinas" />
        <${Tile} icon="trend" title="Propuestas" sub="Revisar y aprobar" to="/propuestas" />
      </div>
      <${MyTraining} showEmpty=${false} />
    ` : html`
      <${MyTraining} />
      <div class="section-title"><h2>Explora</h2></div>
      <div class="tiles">
        <${Tile} icon="dumbbell" title="Catálogo" sub=${`${count} ejercicios`} to="/catalogo" />
        <${Tile} icon="trend" title="Historial" sub="Sesiones y volumen" to="/historial" />
      </div>
    `}
  </div>`;
}
