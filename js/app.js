// Arranque de la app: catálogo, Firebase (diferido), rutas y barra inferior.
import { html, render } from './lib/deps.js';
import { store, useStore, toast } from './lib/store.js';
import { useRoute, go } from './lib/router.js';
import { loadBaseCatalog } from './lib/catalog.js';
import { isConfigured } from './config.js';
import { APP } from './version.js';
import { Icon, Toast } from './lib/ui.js';
import { initPWA, persistStorage } from './lib/pwa.js';
import { UpdateBanner } from './views/offline.js';
import { Login } from './views/login.js';
import { Home } from './views/home.js';
import { Catalog } from './views/catalog.js';
import { ExerciseDetail } from './views/exercise.js';
import { Students } from './views/students.js';
import { CustomExerciseForm } from './views/custom-exercise.js';
import { Profile } from './views/profile.js';
import { Templates } from './views/templates.js';
import { RoutineEditor } from './views/routine-editor.js';
import { StudentDetail } from './views/student.js';
import { DayPreview } from './views/today.js';
import { Train } from './views/train.js';
import { Register } from './views/register.js';
import { TrainerProposals, History } from './views/proposals.js';

// ---------- Arranque ----------
store.set({ configured: isConfigured() });

loadBaseCatalog()
  .then((catalog) => store.set({ catalog }))
  .catch(() => store.set({ catalog: [], toast: { text: 'No se pudo cargar el catálogo', kind: 'bad' } }));

addEventListener('online', () => {
  store.set({ online: true });
  const fb = store.get().fb;
  if (!fb || store.get().authState !== 'in') return;
  toast('Conexión de vuelta: sincronizando…');
  fb.syncPending().then(() => toast('Todo sincronizado')).catch(() => {});
});
addEventListener('offline', () => store.set({ online: false }));
initPWA();

async function initFirebase() {
  if (!isConfigured()) { store.set({ authState: 'out' }); return; }
  let fb;
  try {
    fb = await import('./firebase.js');
  } catch (e) {
    console.error(e);
    store.set({ authState: 'error' });
    return;
  }
  store.set({ fb });
  let unsubProfile = null;
  fb.watchAuth((user) => {
    unsubProfile?.();
    unsubProfile = null;
    if (!user) {
      store.set({ authState: 'out', user: null, profile: undefined, custom: [], customFor: null, toast: null });
      // Al cerrar sesión, la siguiente persona entra a Inicio (salvo páginas públicas).
      if (!/^#\/(ej|catalogo)/.test(location.hash) && location.hash.length > 2) go('/');
      return;
    }
    store.set({ authState: 'in', user, profile: undefined });
    persistStorage(); // que el navegador no borre la caché offline
    unsubProfile = fb.watchProfile(user.uid, (profile) => {
      store.set({ profile });
      if (profile) loadCustom(fb, profile);
    }, () => store.set({ profile: null }));
  });
}

async function loadCustom(fb, profile) {
  const owner = profile.role === 'trainer' ? profile.id : profile.trainerId;
  if (!owner || store.get().customFor === owner) return;
  store.set({ customFor: owner });
  try {
    store.set({ custom: await fb.listCustomExercises(owner) });
  } catch (e) {
    console.warn('Ejercicios propios no disponibles', e);
  }
}

initFirebase();

// ---------- Pantallas de estado ----------
function Boot() {
  return html`<div class="boot"><div class="boot-mark">PH</div></div>`;
}

function Notice({ title, children, actions }) {
  return html`<main class="auth"><div class="auth-in">
    <h1 class="wordmark" style="font-size:52px">Push<span>Harder</span></h1>
    <div class="card"><h3 style="margin:0 0 8px;font-size:18px">${title}</h3><div class="muted">${children}</div>
      <div class="stack mt">${actions}</div></div>
  </div></main>`;
}

const logoutBtn = () => html`<button class="btn btn-block" onClick=${() => store.get().fb?.logout()}><${Icon} name="logout" />Cerrar sesión</button>`;

// ---------- Barra inferior ----------
function TabBar({ path, isTrainer }) {
  const tabs = [
    { to: '/', icon: 'home', label: 'Inicio' },
    { to: '/catalogo', icon: 'dumbbell', label: 'Catálogo' },
    ...(isTrainer ? [{ to: '/rutinas', icon: 'calendar', label: 'Rutinas' }, { to: '/alumnos', icon: 'users', label: 'Alumnos' }]
      : [{ to: '/historial', icon: 'trend', label: 'Historial' }]),
    { to: '/perfil', icon: 'user', label: 'Perfil' },
  ];
  const active = (to) => (to === '/' ? path === '/' || path.startsWith('/dia')
    : path.startsWith(to) || (to === '/catalogo' && path.startsWith('/ej'))
      || (to === '/rutinas' && path.startsWith('/plantilla')) || (to === '/alumnos' && path.startsWith('/alumno')));
  return html`<nav class="tabbar" aria-label="Principal"><div class="tabbar-in">
    ${tabs.map((t) => html`<button class=${`tab ${active(t.to) ? 'active' : ''}`} aria-current=${active(t.to) ? 'page' : null} onClick=${() => go(t.to)}>
      <span class="tab-ico"><${Icon} name=${t.icon} /></span>${t.label}
    </button>`)}
  </div></nav>`;
}

// ---------- Rutas ----------
function App() {
  const route = useRoute();
  const configured = useStore((s) => s.configured);
  const authState = useStore((s) => s.authState);
  const profile = useStore((s) => s.profile);
  const [p0, p1, p2, p3] = route.parts;
  const signedIn = authState === 'in' && profile && profile.active !== false;

  // Rutas públicas (las abre el QR del PDF sin iniciar sesión).
  if (!signedIn) {
    if (p0 === 'ej' && p1) return html`<div class="shell no-tabs"><${ExerciseDetail} id=${p1} /></div>`;
    if (p0 === 'catalogo') return html`<div class="shell no-tabs"><${Catalog} /></div>`;
    if (p0 === 'registro' && configured && authState === 'out') return html`<${Register} />`;
  }

  if (!configured) {
    return html`<${Notice} title="Falta conectar Firebase"
      actions=${html`<button class="btn btn-primary btn-block" onClick=${() => go('/catalogo')}>Ver catálogo</button>`}>
      Pega la configuración web de tu proyecto en <code>js/config.js</code>. La guía paso a paso está en <code>docs/SETUP.md</code>.
    <//>`;
  }
  if (authState === 'error') {
    return html`<${Notice} title="No se pudo cargar la app" actions=${html`<button class="btn btn-primary btn-block" onClick=${() => location.reload()}>Reintentar</button>`}>
      Revisa tu conexión. Cuando la app quede instalada (Fase 5) abrirá también sin señal.
    <//>`;
  }
  if (authState === 'loading') return html`<${Boot} />`;
  if (authState === 'out') return html`<${Login} />`;
  if (profile === undefined) return html`<${Boot} />`;
  if (profile === null) {
    return html`<${Notice} title="Tu cuenta no está vinculada" actions=${logoutBtn()}>
      Entraste bien con <b>${store.get().user?.email}</b>, pero tu cuenta todavía no tiene rol en la app. Si eres alumno, pídele a tu entrenador que te dé de alta con este correo.
    <//>`;
  }
  if (profile.active === false) {
    return html`<${Notice} title="Tu acceso está en pausa" actions=${logoutBtn()}>
      Habla con tu entrenador para reactivarlo. Tu historial sigue guardado.
    <//>`;
  }

  const isTrainer = profile.role === 'trainer';
  let view;
  let tabs = true;
  if (route.path === '/' || !p0) view = html`<${Home} />`;
  else if (p0 === 'catalogo') view = html`<${Catalog} />`;
  else if (p0 === 'ej' && p1) view = html`<${ExerciseDetail} id=${p1} />`;
  else if (p0 === 'perfil') view = html`<${Profile} />`;
  else if (p0 === 'historial') view = html`<${History} />`;
  else if (isTrainer && p0 === 'propuestas') view = html`<${TrainerProposals} />`;
  else if (p0 === 'dia' && p1 && p2) { view = html`<${DayPreview} key=${p2} routineId=${p1} dayId=${p2} />`; tabs = false; }
  else if (p0 === 'entrenar' && p1) { view = html`<${Train} key=${p1} id=${p1} />`; tabs = false; }
  else if (isTrainer && p0 === 'alumnos') view = html`<${Students} />`;
  else if (isTrainer && p0 === 'rutinas') view = html`<${Templates} />`;
  else if (isTrainer && p0 === 'plantilla' && p1 === 'nueva') { view = html`<${RoutineEditor} key="nueva" mode="template" />`; tabs = false; }
  else if (isTrainer && p0 === 'plantilla' && p1) { view = html`<${RoutineEditor} key=${p1} mode="template" tid=${p1} />`; tabs = false; }
  else if (isTrainer && p0 === 'alumno' && p1 && p2 === 'rutina' && p3) { view = html`<${RoutineEditor} key=${p3} mode="student" sid=${p1} routineId=${p3} />`; tabs = false; }
  else if (isTrainer && p0 === 'alumno' && p1) view = html`<${StudentDetail} key=${p1} sid=${p1} />`;
  else if (isTrainer && p0 === 'ejercicio' && p1 === 'nuevo') { view = html`<${CustomExerciseForm} key="nuevo" />`; tabs = false; }
  else if (isTrainer && p0 === 'ejercicio' && p1 === 'editar' && p2) { view = html`<${CustomExerciseForm} key=${p2} id=${p2} />`; tabs = false; }
  else { go('/'); return null; }

  return html`<div class=${`shell ${tabs ? '' : 'no-tabs'}`}>
    ${view}
    ${tabs && html`<${TabBar} path=${route.path} isTrainer=${isTrainer} />`}
  </div>`;
}

const root = document.getElementById('app');
root.innerHTML = '';
render(html`<${App} /><${UpdateBanner} /><${Toast} />`, root);
document.title = APP.name;
