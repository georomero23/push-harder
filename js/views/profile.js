import { html, useState, useEffect } from '../lib/deps.js';
import { store, useStore, toast, friendlyError, committed } from '../lib/store.js';
import { useWatch } from '../lib/hooks.js';
import { Icon, Topbar, initials } from '../lib/ui.js';
import { APP } from '../version.js';
import { InstallCard, OfflinePrep } from './offline.js';
import { isStandalone, storageEstimate, checkForUpdate } from '../lib/pwa.js';

export function Profile() {
  const profile = useStore((s) => s.profile);
  const user = useStore((s) => s.user);
  const [name, setName] = useState(profile?.name || '');
  const fb = store.get().fb;
  const routine = useWatch((f, ok, fail) => f.watchActiveRoutine(profile.id, ok, fail), [profile.id]);
  const [storage, setStorage] = useState(null);
  useEffect(() => { storageEstimate().then(setStorage); }, []);

  async function saveName() {
    try {
      await committed(fb.updateMyName(profile.id, name));
      toast('Nombre actualizado');
    } catch (e) { toast(friendlyError(e), 'bad'); }
  }
  async function changePassword() {
    try { await fb.resetPassword(user.email); toast('Te mandamos un enlace a tu correo'); } catch (e) { toast(friendlyError(e), 'bad'); }
  }

  return html`<div>
    <${Topbar} title="Perfil" />
    <div class="page">
      <div class="card row-gap" style="gap:14px">
        <span class="avatar" style="width:56px;height:56px;font-size:20px">${initials(profile?.name)}</span>
        <div style="min-width:0">
          <div style="font-weight:800;font-size:18px">${profile?.name}</div>
          <div class="muted" style="font-size:14px">${user?.email}</div>
          <div class="eyebrow" style="margin-top:4px">${profile?.role === 'trainer' ? 'Entrenador' : 'Alumno'}</div>
        </div>
      </div>

      <div class="section-title"><h2>Tus datos</h2></div>
      <label class="field"><span>Nombre</span>
        <input class="input" value=${name} maxlength="80" onInput=${(e) => setName(e.target.value)} />
      </label>
      <button class="btn btn-block" disabled=${!name.trim() || name.trim() === profile?.name} onClick=${saveName}><${Icon} name="check" />Guardar nombre</button>

      <div class="section-title"><h2>App y modo sin señal</h2></div>
      <div class="stack">
        ${isStandalone() ? html`<div class="ok-box" style="margin:0">App instalada en este dispositivo.</div>` : html`<${InstallCard} />`}
        ${routine.data && html`<${OfflinePrep} routine=${routine.data} block />`}
        <p class="hint" style="margin:0">Sin señal puedes ver tu rutina, entrenar y registrar series: todo se guarda en el teléfono y se sincroniza solo al volver la conexión.${storage ? ` Espacio usado: ${storage.usedMB.toFixed(0)} MB.` : ''}</p>
      </div>

      <div class="section-title"><h2>Cuenta</h2></div>
      <div class="stack">
        <button class="btn btn-block" onClick=${changePassword}><${Icon} name="key" />Cambiar contraseña</button>
        <button class="btn btn-block btn-danger" onClick=${() => fb.logout()}><${Icon} name="logout" />Cerrar sesión</button>
      </div>
      <p class="hint center mt-lg">${APP.name} · v${APP.version} · <button class="link-btn" style="font-size:12.5px" onClick=${() => { checkForUpdate(); toast('Buscando actualización…'); }}>Buscar actualización</button></p>
    </div>
  </div>`;
}
