import { html, useState } from '../lib/deps.js';
import { store, friendlyError } from '../lib/store.js';
import { go } from '../lib/router.js';
import { APP } from '../version.js';

export function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError(''); setInfo(''); setBusy(true);
    const fb = store.get().fb;
    try {
      if (mode === 'login') {
        await fb.login(email, password);
      } else {
        await fb.resetPassword(email);
        setInfo('Si ese correo tiene cuenta, te llegó un enlace para crear una contraseña nueva. Revisa también spam.');
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return html`<main class="auth">
    <div class="auth-in">
      <h1 class="wordmark">Push<span>Harder</span></h1>
      <p class="tagline">${APP.tagline}</p>
      <form class="card" onSubmit=${submit} novalidate>
        ${error && html`<div class="error-box" role="alert">${error}</div>`}
        ${info && html`<div class="ok-box" role="status">${info}</div>`}
        <label class="field"><span>Correo</span>
          <input class="input" type="email" inputmode="email" autocomplete="email" required
            value=${email} onInput=${(e) => setEmail(e.target.value)} placeholder="tu@correo.com" />
        </label>
        ${mode === 'login' && html`<label class="field"><span>Contraseña</span>
          <input class="input" type="password" autocomplete="current-password" required
            value=${password} onInput=${(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </label>`}
        <button class="btn btn-primary btn-block" disabled=${busy || !email || (mode === 'login' && !password)}>
          ${busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Enviar enlace'}
        </button>
        <div class="auth-links">
          <button type="button" class="link-btn" onClick=${() => { setMode(mode === 'login' ? 'reset' : 'login'); setError(''); setInfo(''); }}>
            ${mode === 'login' ? '¿Olvidaste tu contraseña?' : '← Volver a entrar'}
          </button>
          <button type="button" class="link-btn" onClick=${() => go('/catalogo')}>Ver catálogo</button>
        </div>
      </form>
      <p class="hint center mt">¿Primera vez? Tu entrenador te da de alta y te llega un correo para crear tu contraseña.</p>
    </div>
  </main>`;
}
