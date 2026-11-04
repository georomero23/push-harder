// Altas desde adentro: enlaces de invitación (coach → alumnos, admin → coaches) y panel del administrador.
import { html, useState, useEffect } from '../lib/deps.js';
import { store, useStore, toast, friendlyError } from '../lib/store.js';
import { useWatch } from '../lib/hooks.js';
import { shortDate, localDate } from '../lib/routine.js';
import { Icon, Topbar, Sheet, Spinner, OfflineBanner, initials } from '../lib/ui.js';
import { inviteUrl } from './access.js';

/** Copiar / compartir un enlace (WhatsApp, etc.). */
export function ShareLink({ url, text }) {
  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: 'PUSH HARDER', text, url }); return; }
    } catch { return; }
    copy();
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast('Enlace copiado'); } catch { toast('Copia el enlace a mano', 'bad'); }
  };
  const wa = `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
  return html`<div>
    <div class="linkbox"><code>${url}</code></div>
    <div class="two mt">
      <button type="button" class="btn" onClick=${copy}><${Icon} name="copy" />Copiar</button>
      <a class="btn" href=${wa} target="_blank" rel="noopener"><${Icon} name="share" />WhatsApp</a>
    </div>
    ${navigator.share && html`<button type="button" class="btn btn-block mt" onClick=${share}><${Icon} name="share" />Compartir…</button>`}
  </div>`;
}

const USES = [[1, '1 persona'], [10, 'Hasta 10'], [50, 'Hasta 50']];
const DAYS = [[1, '1 día'], [7, '7 días'], [30, '30 días']];

/** Hoja para crear un enlace. role: 'student' (coach) o 'trainer' (solo admin). */
export function InviteSheet({ open, onClose, role = 'student' }) {
  const me = useStore((s) => s.profile);
  const online = useStore((s) => s.online);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [uses, setUses] = useState(1);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  // Se limpia al cerrar (no al abrir) para no borrar lo que se escribe en cuanto aparece la hoja.
  useEffect(() => { if (!open) { setName(''); setEmail(''); setUses(1); setDays(7); setCode(''); setError(''); } }, [open]);

  async function create(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      setCode(await store.get().fb.createInvite(me, { role, name, email, maxUses: role === 'trainer' ? 1 : uses, days }));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const who = role === 'trainer' ? 'coach' : 'alumno';
  const text = role === 'trainer'
    ? `Te invito a PUSH HARDER como coach. Abre el enlace, crea tu contraseña y listo:`
    : `${me.name} te invita a PUSH HARDER. Abre el enlace, crea tu contraseña y verás tu rutina:`;
  return html`<${Sheet} open=${open} onClose=${onClose} title=${role === 'trainer' ? 'Invitar coach' : 'Invitar alumno'}>
    ${code ? html`
      <div class="ok-box" role="status"><b>Enlace listo.</b> Mándalo por WhatsApp o cópialo. ${uses > 1 && role !== 'trainer' ? `Sirve para ${uses} personas` : 'Sirve para 1 persona'} durante ${days === 1 ? '1 día' : `${days} días`}.</div>
      <${ShareLink} url=${inviteUrl(code)} text=${text} />
      <button class="btn btn-primary btn-block mt" onClick=${onClose}>Listo</button>` : html`
      <form onSubmit=${create}>
        ${!online && html`<div class="banner">Crear enlaces necesita conexión.</div>`}
        ${error && html`<div class="error-box">${error}</div>`}
        <p class="hint" style="margin:0 2px 14px">La persona abre el enlace, crea su contraseña (o entra si ya tenía cuenta) y queda como tu ${who}. No tienes que hacer nada más.</p>
        <label class="field"><span>Nombre (opcional)</span>
          <input class="input" maxlength="80" value=${name} onInput=${(e) => setName(e.target.value)} placeholder="Se lo pre-llena al abrir" />
        </label>
        <label class="field"><span>Solo para este correo (opcional)</span>
          <input class="input" type="email" inputmode="email" value=${email} onInput=${(e) => setEmail(e.target.value)} placeholder=${role === 'trainer' ? 'Recomendado para coaches' : 'Cualquiera con el enlace'} />
        </label>
        ${role !== 'trainer' && html`<div class="field"><span>¿Cuántas personas?</span>
          <div class="chips wrap">${USES.map(([v, l]) => html`<button type="button" class=${`chip ${uses === v ? 'active' : ''}`} onClick=${() => setUses(v)}>${l}</button>`)}</div>
        </div>`}
        <div class="field"><span>Vence en</span>
          <div class="chips wrap">${DAYS.map(([v, l]) => html`<button type="button" class=${`chip ${days === v ? 'active' : ''}`} onClick=${() => setDays(v)}>${l}</button>`)}</div>
        </div>
        <button class="btn btn-primary btn-block" disabled=${busy || !online || (email && !/\S+@\S+\.\S+/.test(email))}>
          <${Icon} name="link" />${busy ? 'Creando…' : 'Crear enlace'}
        </button>
      </form>`}
  <//>`;
}

/** Enlaces activos del usuario (para revisar o desactivar). */
export function MyInvites({ role }) {
  const me = useStore((s) => s.profile);
  const invites = useWatch((fb, ok, fail) => fb.watchMyInvites(me.id, ok, fail), [me.id]);
  const [shown, setShown] = useState(null);
  const live = (invites.data || []).filter((i) => (!role || i.role === role) && i.active && i.uses < i.maxUses && i.expiresAtMs > Date.now());
  if (!live.length) return null;
  const off = async (code) => {
    try { await store.get().fb.deactivateInvite(code); toast('Enlace desactivado'); } catch (e) { toast(friendlyError(e), 'bad'); }
  };
  return html`<div>
    <div class="section-title"><h2>Enlaces activos</h2></div>
    <div class="list">${live.map((i) => html`<div class="row" key=${i.id}>
      <span class="avatar"><${Icon} name="link" size="18" /></span>
      <button class="grow plain" onClick=${() => setShown(shown === i.id ? null : i.id)}>
        <div class="title">${i.name || i.email || (i.role === 'trainer' ? 'Coach' : 'Alumno nuevo')}</div>
        <div class="subtitle">${i.role === 'trainer' ? 'Coach' : 'Alumno'} · ${i.uses}/${i.maxUses} usos · vence ${shortDate(localDate(new Date(i.expiresAtMs)))}</div>
      </button>
      <button class="btn btn-sm" onClick=${() => off(i.id)}>Desactivar</button>
    </div>${shown === i.id && html`<div style="padding:4px 0 12px"><${ShareLink} url=${inviteUrl(i.id)} text="Únete a PUSH HARDER:" /></div>`}`)}</div>
  </div>`;
}

// ---------- Panel del administrador ----------
export function Team() {
  const me = useStore((s) => s.profile);
  const reqs = useWatch((fb, ok, fail) => fb.watchPendingRequests(ok, fail), []);
  const coaches = useWatch((fb, ok, fail) => fb.watchTrainers(ok, fail), []);
  const [inviting, setInviting] = useState(false);
  const [approving, setApproving] = useState(null);
  const [busy, setBusy] = useState('');

  if (!me.admin) return html`<div><${Topbar} title="Equipo" back /><div class="page"><div class="card empty">Solo el administrador ve esta sección.</div></div></div>`;
  const list = (coaches.data || []).slice().sort((a, b) => (b.id === me.id) - (a.id === me.id) || (b.active - a.active) || a.name.localeCompare(b.name, 'es'));

  const run = async (id, fn, ok) => {
    setBusy(id);
    try { await fn(); toast(ok); } catch (e) { toast(friendlyError(e), 'bad'); } finally { setBusy(''); }
  };

  return html`<div>
    <${Topbar} title="Equipo" sub="Coaches y solicitudes de acceso" back
      actions=${html`<button class="icon-btn" aria-label="Invitar coach" onClick=${() => setInviting(true)}><${Icon} name="plus" /></button>`} />
    <div class="page">
      <${OfflineBanner} />
      <div class="section-title"><h2>Solicitudes de acceso</h2>${(reqs.data || []).length > 0 && html`<span class="badge">${reqs.data.length}</span>`}</div>
      ${reqs.loading ? html`<${Spinner} />` : !(reqs.data || []).length ? html`<div class="faint" style="font-size:14px">Nadie está esperando. Quien se registre sin enlace aparece aquí.</div>` : html`
        <div class="list">${reqs.data.map((r) => html`<div class="row" key=${r.id}>
          <span class="avatar">${initials(r.name || r.email)}</span>
          <span class="grow"><div class="title">${r.name || 'Sin nombre'}</div><div class="subtitle">${r.email} · ${shortDate(localDate(new Date(r.createdAtMs)))}</div></span>
          <button class="btn btn-sm btn-primary" disabled=${!!busy} onClick=${() => setApproving(r)}>Dar acceso</button>
        </div>`)}</div>`}

      <div class="section-title"><h2>Coaches</h2></div>
      ${coaches.loading ? html`<${Spinner} />` : html`
        <div class="list">${list.map((c) => html`<div class="row" key=${c.id}>
          <span class=${`avatar ${c.active ? '' : 'off'}`}>${initials(c.name)}</span>
          <span class="grow"><div class="title">${c.id === me.id ? `Tú · ${c.name}` : c.name}${c.admin ? ' · admin' : ''}</div><div class="subtitle">${c.email}</div></span>
          ${c.id !== me.id ? html`<button class="btn btn-sm" disabled=${busy === c.id}
            onClick=${() => (c.active ? window.confirm(`¿Pausar a ${c.name}? No podrá entrar hasta que lo reactives. Sus alumnos siguen entrenando.`) : true)
              && run(c.id, () => store.get().fb.setStudentActive(c.id, !c.active), c.active ? 'Coach en pausa' : 'Coach reactivado')}>
            ${c.active ? 'Pausar' : 'Reactivar'}</button>` : html`<span class="status on">Activo</span>`}
        </div>`)}</div>`}
      <button class="btn btn-block mt" onClick=${() => setInviting(true)}><${Icon} name="link" />Invitar coach con enlace</button>
      <${MyInvites} role="trainer" />
    </div>
    <${InviteSheet} open=${inviting} onClose=${() => setInviting(false)} role="trainer" />
    <${ApproveSheet} req=${approving} onClose=${() => setApproving(null)} coaches=${list.filter((c) => c.active)} />
  </div>`;
}

function ApproveSheet({ req, onClose, coaches }) {
  const me = useStore((s) => s.profile);
  const [role, setRole] = useState('student');
  const [trainerId, setTrainerId] = useState(me.id);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (req) { setRole('student'); setTrainerId(me.id); setName(req.name || ''); } }, [req?.id]);
  if (!req) return null;
  const fb = store.get().fb;

  async function approve() {
    setBusy(true);
    try {
      await fb.approveRequest(req, { role, trainerId, name }, me);
      toast(role === 'trainer' ? `${name || req.email} ya es coach` : `${name || req.email} ya está dado de alta`);
      onClose();
    } catch (e) { toast(friendlyError(e), 'bad'); } finally { setBusy(false); }
  }
  async function reject() {
    if (!window.confirm('¿Rechazar esta solicitud?')) return;
    setBusy(true);
    try { await fb.rejectRequest(req, me); toast('Solicitud rechazada'); onClose(); } catch (e) { toast(friendlyError(e), 'bad'); } finally { setBusy(false); }
  }

  return html`<${Sheet} open=${!!req} onClose=${onClose} title="Dar acceso">
    <p class="muted" style="margin:0 0 14px">${req.email}</p>
    <label class="field"><span>Nombre</span><input class="input" maxlength="80" value=${name} onInput=${(e) => setName(e.target.value)} /></label>
    <div class="field"><span>Entra como</span>
      <div class="seg"><button type="button" class=${role === 'student' ? 'on' : ''} onClick=${() => setRole('student')}>Alumno</button>
        <button type="button" class=${role === 'trainer' ? 'on' : ''} onClick=${() => setRole('trainer')}>Coach</button></div>
    </div>
    ${role === 'student' && html`<div class="field"><span>Su coach</span>
      <select class="select" value=${trainerId} onChange=${(e) => setTrainerId(e.target.value)}>
        ${coaches.map((c) => html`<option value=${c.id}>${c.id === me.id ? `Yo (${c.name})` : c.name}</option>`)}
      </select></div>`}
    <button class="btn btn-primary btn-block" disabled=${busy || !name.trim()} onClick=${approve}><${Icon} name="check" />${role === 'trainer' ? 'Darle acceso de coach' : 'Darle acceso de alumno'}</button>
    <button class="btn btn-block mt" disabled=${busy} onClick=${reject}>Rechazar</button>
  <//>`;
}
