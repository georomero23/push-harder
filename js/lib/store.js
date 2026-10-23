// Estado global mínimo con suscripción. Sin dependencias.
import { useState, useEffect } from './deps.js';

function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
      subs.forEach((fn) => fn(state));
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

export const store = createStore({
  configured: false,      // ¿hay firebaseConfig?
  fb: null,               // módulo js/firebase.js ya cargado
  authState: 'loading',   // 'loading' | 'out' | 'in'
  user: null,             // usuario de Firebase Auth
  profile: undefined,     // undefined = cargando · null = sin doc · {…} = users/{uid}
  catalog: null,          // ejercicios base (data/catalog.json)
  custom: [],             // ejercicios propios (Firestore)
  online: navigator.onLine,
  toast: null,
  catalogUI: { q: '', group: 'all', equipment: 'all' },
});

export function useStore(select) {
  const [value, setValue] = useState(() => select(store.get()));
  useEffect(() => store.subscribe((s) => setValue(select(s))), []);
  return value;
}

let toastTimer;
export function toast(text, kind = 'ok') {
  clearTimeout(toastTimer);
  store.set({ toast: { text, kind } });
  toastTimer = setTimeout(() => store.set({ toast: null }), 2800);
}

/** Espera la confirmación del servidor solo si hay red; offline, la escritura queda en cola. */
export async function committed(promise) {
  if (!navigator.onLine) {
    promise.catch((e) => toast(friendlyError(e), 'bad'));
    return 'queued';
  }
  await promise;
  return 'saved';
}

export function friendlyError(e) {
  const code = e?.code || '';
  const map = {
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/wrong-password': 'Correo o contraseña incorrectos.',
    'auth/user-not-found': 'Correo o contraseña incorrectos.',
    'auth/invalid-email': 'Ese correo no es válido.',
    'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
    'auth/network-request-failed': 'Sin conexión. Inténtalo cuando tengas señal.',
    'auth/email-already-in-use': 'Ya existe una cuenta con ese correo.',
    'auth/weak-password': 'La contraseña es muy débil: usa al menos 8 caracteres.',
    'auth/operation-not-allowed': 'El acceso con correo no está activado en Firebase.',
    'auth/user-disabled': 'Esta cuenta está desactivada.',
    'permission-denied': 'No tienes permiso para hacer esto.',
    'unavailable': 'Sin conexión con el servidor. Se reintentará solo.',
  };
  return map[code] || e?.message || 'Algo salió mal.';
}
