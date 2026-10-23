// Crear cuenta (ruta oculta #/registro). Sirve para que el entrenador cree la suya la primera vez.
// Una cuenta nueva no puede ver nada hasta que se le asigna un rol (las reglas lo impiden):
// el entrenador se activa una sola vez desde Firebase Console; los alumnos los da de alta el entrenador.
import { html, useState } from '../lib/deps.js';
import { store, friendlyError } from '../lib/store.js';
import { go } from '../lib/router.js';

export function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const valid = /\S+@\S+\.\S+/.test(email) && password.length >= 8 && password === confirm;

  async function submit(e) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setError('');
    try {
      await store.get().fb.signup(email, password);
      go('/');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return html`<main class="auth">
    <div class="auth-in">
      <h1 class="wordmark" style="font-size:56px">Push<span>Harder</span></h1>
      <p class="tagline">Crea tu cuenta. Después se activa con tu rol y listo.</p>
      <form class="card" onSubmit=${submit} novalidate>
        ${error && html`<div class="error-box" role="alert">${error}</div>`}
        <label class="field"><span>Correo</span>
          <input class="input" type="email" inputmode="email" autocomplete="email" value=${email} onInput=${(e) => setEmail(e.target.value)} placeholder="tu@correo.com" />
        </label>
        <label class="field"><span>Contraseña (mínimo 8 caracteres)</span>
          <input class="input" type="password" autocomplete="new-password" value=${password} onInput=${(e) => setPassword(e.target.value)} />
        </label>
        <label class="field"><span>Repite la contraseña</span>
          <input class="input" type="password" autocomplete="new-password" value=${confirm} onInput=${(e) => setConfirm(e.target.value)} />
        </label>
        ${confirm && password !== confirm && html`<p class="hint" style="margin:-6px 2px 12px;color:var(--warn)">Las contraseñas no coinciden.</p>`}
        <button class="btn btn-primary btn-block" disabled=${busy || !valid}>${busy ? 'Creando…' : 'Crear cuenta'}</button>
        <div class="auth-links"><button type="button" class="link-btn" onClick=${() => go('/')}>← Ya tengo cuenta</button></div>
      </form>
    </div>
  </main>`;
}
