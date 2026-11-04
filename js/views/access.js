// Entrar al sistema sin tocar la consola: enlace de invitación (#/unirme/CODIGO) y solicitud de acceso.
import { html, useState, useEffect } from '../lib/deps.js';
import { store, useStore, friendlyError, toast } from '../lib/store.js';
import { go } from '../lib/router.js';
import { Icon, Spinner } from '../lib/ui.js';

export const inviteUrl = (code) => `${location.origin}${location.pathname}#/unirme/${code}`;

/** Lee la invitación (no necesita sesión) y dice si todavía sirve. */
function useInvite(code) {
  const [state, setState] = useState({ loading: true, inv: null, error: '' });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const fb = store.get().fb || await import('../firebase.js');
        const inv = await fb.getInvite(code);
        if (alive) setState({ loading: false, inv, error: '' });
      } catch (e) {
        if (alive) setState({ loading: false, inv: null, error: friendlyError(e) });
      }
    })();
    return () => { alive = false; };
  }, [code]);
  return state;
}

export function inviteProblem(inv) {
  if (!inv) return 'Este enlace no existe. Pídele a tu entrenador uno nuevo.';
  if (!inv.active) return 'Este enlace ya no está activo. Pídele uno nuevo a quien te lo mandó.';
  if (inv.uses >= inv.maxUses) return 'Este enlace ya se usó. Pídele uno nuevo a quien te lo mandó.';
  if (Date.now() > inv.expiresAtMs) return 'Este enlace ya venció. Pídele uno nuevo a quien te lo mandó.';
  return '';
}

const Shell = ({ children }) => html`<main class="auth"><div class="auth-in">
  <h1 class="wordmark" style="font-size:52px">Push<span>Harder</span></h1>${children}
</div></main>`;

/** #/unirme/:code — crear cuenta o entrar, y quedar vinculado con un toque. */
export function Join({ code }) {
  const authState = useStore((s) => s.authState);
  const user = useStore((s) => s.user);
  const profile = useStore((s) => s.profile);
  const { loading, inv, error: loadError } = useInvite(code);
  const [mode, setMode] = useState('signup'); // 'signup' | 'login'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (inv?.name && !name) setName(inv.name); if (inv?.email && !email) setEmail(inv.email); }, [inv]);

  if (loading || authState === 'loading' || (authState === 'in' && profile === undefined)) return html`<${Shell}><${Spinner} /><//>`;
  const problem = loadError || inviteProblem(inv);
  const what = inv?.role === 'trainer' ? 'como coach' : `como alumno de ${inv?.trainerName || 'tu entrenador'}`;

  if (profile) {
    return html`<${Shell}><div class="card">
      <h3 style="margin:0 0 8px">Ya tienes cuenta</h3>
      <p class="muted">Entraste como <b>${user?.email}</b> y ya estás dado de alta. Este enlace es para alguien nuevo.</p>
      <button class="btn btn-primary btn-block mt" onClick=${() => go('/')}>Ir a inicio</button>
    </div><//>`;
  }
  if (problem) {
    return html`<${Shell}><div class="card">
      <h3 style="margin:0 0 8px">Enlace no válido</h3><p class="muted">${problem}</p>
      <button class="btn btn-block mt" onClick=${() => go('/')}>Ir al inicio</button>
    </div><//>`;
  }

  const fb = () => store.get().fb;
  async function redeem() {
    await fb().redeemInvite(code, name);
    toast('¡Listo! Ya estás dentro');
    go('/');
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (authState !== 'in') {
        if (mode === 'signup') await fb().signup(email, password);
        else await fb().login(email, password);
        // Espera a que la app vea la sesión nueva
        await new Promise((r) => setTimeout(r, 300));
      }
      if (inv.email && fb().auth.currentUser?.email?.toLowerCase() !== inv.email) {
        throw new Error(`Este enlace es para ${inv.email}. Entra con ese correo.`);
      }
      await redeem();
    } catch (err) {
      setError(err?.code === 'permission-denied' ? 'No se pudo usar el enlace (ya se usó, venció o es para otro correo).' : friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const signedIn = authState === 'in';
  const valid = name.trim() && (signedIn || (/\S+@\S+\.\S+/.test(email) && password.length >= (mode === 'signup' ? 8 : 1)));
  return html`<${Shell}>
    <p class="tagline">Te invitaron a entrar ${what}.</p>
    <form class="card" onSubmit=${submit} novalidate>
      ${error && html`<div class="error-box" role="alert">${error}</div>`}
      ${!signedIn && html`<div class="seg" style="margin-bottom:16px">
        <button type="button" class=${mode === 'signup' ? 'on' : ''} onClick=${() => setMode('signup')}>Soy nuevo</button>
        <button type="button" class=${mode === 'login' ? 'on' : ''} onClick=${() => setMode('login')}>Ya tengo cuenta</button>
      </div>`}
      <label class="field"><span>Tu nombre</span>
        <input class="input" maxlength="80" autocomplete="name" value=${name} onInput=${(e) => setName(e.target.value)} placeholder="Nombre y apellido" />
      </label>
      ${signedIn ? html`<p class="hint" style="margin:-4px 2px 16px">Entraste como <b>${user?.email}</b>.</p>` : html`
        <label class="field"><span>Correo</span>
          <input class="input" type="email" inputmode="email" autocomplete="email" value=${email} readonly=${!!inv.email}
            onInput=${(e) => setEmail(e.target.value)} placeholder="tu@correo.com" />
        </label>
        <label class="field"><span>${mode === 'signup' ? 'Crea tu contraseña (mínimo 8)' : 'Contraseña'}</span>
          <input class="input" type="password" autocomplete=${mode === 'signup' ? 'new-password' : 'current-password'} value=${password} onInput=${(e) => setPassword(e.target.value)} />
        </label>`}
      <button class="btn btn-primary btn-block" disabled=${busy || !valid}>${busy ? 'Un momento…' : signedIn ? 'Unirme' : mode === 'signup' ? 'Crear cuenta y entrar' : 'Entrar y unirme'}</button>
      ${signedIn && html`<div class="auth-links"><button type="button" class="link-btn" onClick=${() => fb().logout()}>Usar otra cuenta</button></div>`}
    </form>
  <//>`;
}

/** Cuenta sin rol: código de invitación o pedir acceso al administrador. */
export function Unlinked() {
  const user = useStore((s) => s.user);
  const [req, setReq] = useState(undefined);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const fb = store.get().fb;

  useEffect(() => fb.watchMyRequest(user.uid, setReq, () => setReq(null)), [user.uid]);

  async function ask(e) {
    e.preventDefault();
    setBusy(true);
    try { await fb.requestAccess(name); toast('Solicitud enviada'); } catch (err) { toast(friendlyError(err), 'bad'); } finally { setBusy(false); }
  }
  function useCode(e) {
    e.preventDefault();
    const c = code.trim().replace(/.*\/unirme\//, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (c) go(`/unirme/${c}`);
  }

  return html`<${Shell}>
    <div class="card">
      <h3 style="margin:0 0 8px;font-size:18px">Tu cuenta todavía no está vinculada</h3>
      <p class="muted" style="margin:0">Entraste con <b>${user?.email}</b>. Falta que tu coach te dé de alta.</p>
    </div>
    <form class="card mt" onSubmit=${useCode}>
      <h3 style="margin:0 0 6px;font-size:16px">¿Tienes un enlace o código?</h3>
      <label class="field"><span>Pega el enlace que te mandaron</span>
        <input class="input" value=${code} onInput=${(e) => setCode(e.target.value)} placeholder="…/#/unirme/abcd1234…" />
      </label>
      <button class="btn btn-primary btn-block" disabled=${!code.trim()}>Usar enlace</button>
    </form>
    <div class="card mt">
      ${req === undefined ? html`<${Spinner} />` : req?.status === 'pending' ? html`
        <div class="ok-box" role="status" style="margin:0"><b>Solicitud enviada.</b> En cuanto te den acceso, esta pantalla cambia sola.</div>` : html`
        <form onSubmit=${ask}>
          <h3 style="margin:0 0 6px;font-size:16px">¿No tienes enlace?</h3>
          ${req?.status === 'rejected' && html`<div class="error-box">Tu solicitud anterior no se aprobó. Puedes volver a pedirla.</div>`}
          <label class="field"><span>Tu nombre</span>
            <input class="input" maxlength="80" value=${name} onInput=${(e) => setName(e.target.value)} placeholder="Nombre y apellido" />
          </label>
          <button class="btn btn-block" disabled=${busy || !name.trim()}><${Icon} name="mail" />Pedir acceso</button>
        </form>`}
    </div>
    <button class="btn btn-block mt" onClick=${() => fb.logout()}><${Icon} name="logout" />Cerrar sesión</button>
  <//>`;
}
