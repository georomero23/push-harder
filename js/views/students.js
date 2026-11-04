import { html, useState, useEffect } from '../lib/deps.js';
import { store, useStore, toast, friendlyError } from '../lib/store.js';
import { go } from '../lib/router.js';
import { Icon, Topbar, Sheet, Spinner, OfflineBanner, initials } from '../lib/ui.js';
import { InviteSheet, MyInvites } from './team.js';

export function Students() {
  const profile = useStore((s) => s.profile);
  const online = useStore((s) => s.online);
  const [students, setStudents] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);   // hoja para elegir cómo
  const [mode, setMode] = useState(null);        // 'link' | 'email'
  const pick = (m) => { setAdding(false); setMode(m); };

  useEffect(() => {
    const fb = store.get().fb;
    return fb.watchStudents(profile.id, setStudents, (e) => setError(friendlyError(e)));
  }, [profile.id]);

  const sorted = (students || []).slice().sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name, 'es'));

  return html`<div>
    <${Topbar} title="Alumnos" sub=${students ? activeLabel(students.filter((s) => s.active).length) : ''}
      actions=${html`<button class="icon-btn" aria-label="Agregar alumno" onClick=${() => setAdding(true)}><${Icon} name="plus" /></button>`} />
    <div class="page">
      <${OfflineBanner} />
      ${error && html`<div class="error-box">${error}</div>`}
      <div class="list" style="margin-bottom:12px">
        <button class="row" onClick=${() => go(`/alumno/${profile.id}`)}>
          <span class="avatar">${initials(profile.name)}</span>
          <span class="grow"><div class="title">Tú · ${profile.name}</div><div class="subtitle">Tu propia rutina y registros</div></span>
          <${Icon} name="right" />
        </button>
      </div>
      ${!students ? html`<${Spinner} />` : sorted.length === 0 ? html`
        <div class="card empty">
          <b>Todavía no tienes alumnos</b>
          Mándale un enlace por WhatsApp: lo abre, crea su contraseña y aparece aquí con su rutina lista para asignar.
          <div class="mt"><button class="btn btn-primary" onClick=${() => setAdding(true)}><${Icon} name="plus" />Agregar alumno</button></div>
        </div>` : html`
        <div class="list">
          ${sorted.map((s) => html`<button class="row" key=${s.id} onClick=${() => go(`/alumno/${s.id}`)}>
            <span class=${`avatar ${s.active ? '' : 'off'}`}>${initials(s.name)}</span>
            <span class="grow"><div class="title">${s.name}</div><div class="subtitle">${s.email}</div></span>
            <span class=${`status ${s.active ? 'on' : 'off'}`}>${s.active ? 'Activo' : 'Pausado'}</span>
          </button>`)}
        </div>`}
      <${MyInvites} role="student" />
    </div>
    <${Sheet} open=${adding} onClose=${() => setAdding(false)} title="Agregar alumno">
      <div class="list">
        <button class="row" onClick=${() => pick('link')}>
          <span class="avatar"><${Icon} name="link" size="20" /></span>
          <span class="grow"><div class="title">Invitar con enlace</div><div class="subtitle">Lo mandas por WhatsApp y se da de alta solo · recomendado</div></span>
          <${Icon} name="right" />
        </button>
        <button class="row" onClick=${() => pick('email')}>
          <span class="avatar"><${Icon} name="mail" size="20" /></span>
          <span class="grow"><div class="title">Crear su cuenta por correo</div><div class="subtitle">Le llega un correo para poner su contraseña</div></span>
          <${Icon} name="right" />
        </button>
      </div>
    <//>
    <${InviteSheet} open=${mode === 'link'} onClose=${() => setMode(null)} role="student" />
    <${AddStudent} open=${mode === 'email'} onClose=${() => setMode(null)} trainerId=${profile.id} online=${online} />
  </div>`;
}

const activeLabel = (n) => `${n} ${n === 1 ? 'activo' : 'activos'}`;

function AddStudent({ open, onClose, trainerId, online }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await store.get().fb.createStudent(trainerId, { name, email });
      toast(`Listo. Le llegó un correo a ${email.trim()} para crear su contraseña.`);
      setName(''); setEmail(''); onClose();
    } catch (err) {
      setError(err?.code === 'auth/email-already-in-use'
        ? 'Ese correo ya tiene cuenta. Mejor mándale un enlace de invitación: lo abre, entra con su cuenta y queda contigo.'
        : friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return html`<${Sheet} open=${open} onClose=${onClose} title="Nuevo alumno">
    <form onSubmit=${submit}>
      ${!online && html`<div class="banner">Dar de alta necesita conexión.</div>`}
      ${error && html`<div class="error-box">${error}</div>`}
      <label class="field"><span>Nombre</span>
        <input class="input" required maxlength="80" value=${name} onInput=${(e) => setName(e.target.value)} placeholder="Nombre y apellido" />
      </label>
      <label class="field"><span>Correo</span>
        <input class="input" type="email" inputmode="email" required value=${email} onInput=${(e) => setEmail(e.target.value)} placeholder="alumno@correo.com" />
      </label>
      <p class="hint" style="margin:-4px 2px 16px">Firebase le manda un correo para que elija su contraseña. Tú nunca la ves.</p>
      <button class="btn btn-primary btn-block" disabled=${busy || !online || !name.trim() || !/\S+@\S+\.\S+/.test(email)}>
        ${busy ? 'Creando cuenta…' : 'Dar de alta'}
      </button>
    </form>
  <//>`;
}
