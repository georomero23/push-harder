// Firebase: Auth (correo/contraseña) + Firestore con caché persistente (offline).
// Este módulo se carga de forma diferida (import dinámico) para que las páginas públicas
// del catálogo abran sin descargar el SDK.
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth, initializeAuth, inMemoryPersistence, connectAuthEmulator,
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail, createUserWithEmailAndPassword,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, orderBy, limit, getDocs, onSnapshot,
  serverTimestamp, writeBatch, waitForPendingWrites,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './config.js';

// Emuladores locales para desarrollo: abre http://localhost:XXXX/?emu
const useEmu = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('emu');

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
auth.languageCode = 'es';

// Persistencia offline: lecturas desde caché y escrituras en cola que se sincronizan solas.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (useEmu) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

// ---------- Sesión ----------
export const watchAuth = (cb) => onAuthStateChanged(auth, cb);
export const login = (email, password) => signInWithEmailAndPassword(auth, email.trim(), password);
export const signup = (email, password) => createUserWithEmailAndPassword(auth, email.trim(), password);
export const logout = () => signOut(auth);
export const resetPassword = (email) => sendPasswordResetEmail(auth, email.trim());

export function watchProfile(uid, cb, onError) {
  return onSnapshot(doc(db, 'users', uid), (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null), onError);
}

// ---------- Alumnos (solo entrenador) ----------
export function watchStudents(trainerUid, cb, onError) {
  const q = query(collection(db, 'users'), where('trainerId', '==', trainerUid));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.id !== trainerUid));
  }, onError);
}

/**
 * Da de alta a un alumno sin cerrar la sesión del entrenador:
 * 1) crea la cuenta en una instancia secundaria de Auth (en memoria),
 * 2) el entrenador escribe users/{uid} con role 'student',
 * 3) Firebase le manda al alumno un correo para que ponga su contraseña.
 */
export async function createStudent(trainerUid, { name, email }) {
  const secondary = initializeApp(firebaseConfig, `alta-${Date.now()}`);
  let uid;
  try {
    const secAuth = initializeAuth(secondary, { persistence: inMemoryPersistence });
    if (useEmu) connectAuthEmulator(secAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const cred = await createUserWithEmailAndPassword(secAuth, email.trim(), tempPassword());
    uid = cred.user.uid;
    await signOut(secAuth);
  } finally {
    await deleteApp(secondary);
  }
  await setDoc(doc(db, 'users', uid), {
    role: 'student',
    trainerId: trainerUid,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    active: true,
    prefs: {},
    notes: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await sendPasswordResetEmail(auth, email.trim());
  return uid;
}

export const setStudentActive = (uid, active) =>
  updateDoc(doc(db, 'users', uid), { active, updatedAt: serverTimestamp() });

export const updateMyName = (uid, name) =>
  updateDoc(doc(db, 'users', uid), { name: name.trim(), updatedAt: serverTimestamp() });

function tempPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)) + 'aA1!';
}

// ---------- Ejercicios propios ----------
export async function listCustomExercises(ownerId) {
  const snap = await getDocs(query(collection(db, 'exercises'), where('ownerId', '==', ownerId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), src: 'custom' }));
}

export async function getCustomExercise(id) {
  const snap = await getDoc(doc(db, 'exercises', id));
  return snap.exists() ? { id: snap.id, ...snap.data(), src: 'custom' } : null;
}

export async function saveCustomExercise(id, data, isNew) {
  const payload = { ...data, updatedAt: serverTimestamp() };
  if (isNew) payload.createdAt = serverTimestamp();
  delete payload.src;
  await setDoc(doc(db, 'exercises', id), payload, { merge: !isNew });
}

export const deleteCustomExercise = (id) => deleteDoc(doc(db, 'exercises', id));

// ---------- Helpers ----------
const list = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const one = (snap) => (snap.exists() ? { id: snap.id, ...snap.data() } : null);
const stamp = () => serverTimestamp();
export const newId = (...path) => doc(collection(db, ...path)).id;

// ---------- Plantillas (biblioteca del entrenador) ----------
export const watchTemplates = (trainerId, cb, onError) =>
  onSnapshot(query(collection(db, 'templates'), where('trainerId', '==', trainerId)), (s) => cb(list(s)), onError);
export const watchTemplate = (id, cb, onError) => onSnapshot(doc(db, 'templates', id), (s) => cb(one(s)), onError);

export function saveTemplate(id, data, isNew) {
  const payload = { ...data, updatedAt: stamp() };
  if (isNew) payload.createdAt = stamp();
  return setDoc(doc(db, 'templates', id), payload, { merge: !isNew });
}
export const deleteTemplate = (id) => deleteDoc(doc(db, 'templates', id));

// ---------- Rutinas asignadas ----------
export const watchRoutines = (sid, cb, onError) =>
  onSnapshot(collection(db, 'users', sid, 'routines'), (s) => cb(list(s)), onError);
export const watchActiveRoutine = (sid, cb, onError) =>
  onSnapshot(query(collection(db, 'users', sid, 'routines'), where('status', '==', 'active')),
    (s) => cb(list(s).sort((a, b) => (b.assignedAtMs || 0) - (a.assignedAtMs || 0))[0] || null), onError);
export const watchRoutine = (sid, rid, cb, onError) => onSnapshot(doc(db, 'users', sid, 'routines', rid), (s) => cb(one(s)), onError);

/**
 * Asigna una rutina (desde plantilla o en blanco) como la activa del alumno.
 * En un solo lote: archiva la activa anterior, crea la nueva y su documento de progreso.
 */
export async function assignRoutine({ sid, trainerId, data, currentActiveIds = [] }) {
  const rid = newId('users', sid, 'routines');
  const batch = writeBatch(db);
  for (const old of currentActiveIds) {
    batch.update(doc(db, 'users', sid, 'routines', old), { status: 'archived', updatedAt: stamp() });
  }
  batch.set(doc(db, 'users', sid, 'routines', rid), {
    ...data, studentId: sid, trainerId, status: 'active', version: 1,
    assignedAtMs: Date.now(), createdAt: stamp(), updatedAt: stamp(),
  });
  batch.set(doc(db, 'users', sid, 'progress', rid), {
    studentId: sid, routineId: rid, loads: {}, recent: {}, flags: {}, updatedAt: stamp(),
  });
  batch.set(doc(collection(db, 'users', sid, 'changes')), {
    studentId: sid, routineId: rid, by: trainerId, byRole: 'trainer', kind: 'routine_assigned',
    summary: [`Rutina asignada: ${data.name}`], atMs: Date.now(), at: stamp(),
  });
  await batch.commit();
  return rid;
}

/** Guarda la estructura editada, sube la versión y deja constancia en el historial. */
export async function saveRoutine({ sid, rid, data, version, byUid, summary, loads }) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', sid, 'routines', rid), { ...data, version: (version || 1) + 1, updatedAt: stamp() });
  if (loads && Object.keys(loads).length) {
    const patch = { updatedAt: stamp() };
    for (const [slotId, v] of Object.entries(loads)) patch[`loads.${slotId}`] = v;
    batch.update(doc(db, 'users', sid, 'progress', rid), patch);
  }
  if (summary?.length) {
    batch.set(doc(collection(db, 'users', sid, 'changes')), {
      studentId: sid, routineId: rid, by: byUid, byRole: 'trainer', kind: 'manual_edit',
      summary: summary.slice(0, 40), atMs: Date.now(), at: stamp(),
    });
  }
  await batch.commit();
}

export const setRoutineStatus = (sid, rid, status) =>
  updateDoc(doc(db, 'users', sid, 'routines', rid), { status, updatedAt: stamp() });

// ---------- Progreso vivo ----------
export const watchProgress = (sid, rid, cb, onError) => onSnapshot(doc(db, 'users', sid, 'progress', rid), (s) => cb(one(s)), onError);

/** Actualiza campos puntuales con rutas "recent.s_x" para no pisar otros slots. */
export function patchProgress(sid, rid, patch) {
  return updateDoc(doc(db, 'users', sid, 'progress', rid), { ...patch, updatedAt: stamp() });
}

// ---------- Sesiones ----------
export const sessionRef = (sid, id) => doc(db, 'users', sid, 'sessions', id);
export function createSession(sid, id, data) {
  return setDoc(sessionRef(sid, id), { ...data, startedAt: stamp(), updatedAt: stamp() });
}
export function updateSession(sid, id, patch) {
  return updateDoc(sessionRef(sid, id), { ...patch, updatedAt: stamp() });
}
export const deleteSession = (sid, id) => deleteDoc(sessionRef(sid, id));
export const watchSession = (sid, id, cb, onError) => onSnapshot(sessionRef(sid, id), (s) => cb(one(s)), onError);
export const watchOpenSessions = (sid, cb, onError) =>
  onSnapshot(query(collection(db, 'users', sid, 'sessions'), where('status', '==', 'open')), (s) => cb(list(s)), onError);
export const watchRecentSessions = (sid, n, cb, onError) =>
  onSnapshot(query(collection(db, 'users', sid, 'sessions'), orderBy('startedAtMs', 'desc'), limit(n)), (s) => cb(list(s)), onError);

// ---------- Historial ----------
export function addChange(sid, data) {
  return setDoc(doc(collection(db, 'users', sid, 'changes')), { ...data, studentId: sid, atMs: Date.now(), at: stamp() });
}
export const watchChanges = (sid, n, cb, onError) =>
  onSnapshot(query(collection(db, 'users', sid, 'changes'), orderBy('atMs', 'desc'), limit(n)), (s) => cb(list(s)), onError);

/** Perfil de un alumno (para la ficha del entrenador). */
export const watchUser = (uid, cb, onError) => onSnapshot(doc(db, 'users', uid), (s) => cb(one(s)), onError);

// ---------- Fase 3: propuestas del motor ----------
export const getRoutine = async (sid, rid) => one(await getDoc(doc(db, 'users', sid, 'routines', rid)));
export const getProgress = async (sid, rid) => one(await getDoc(doc(db, 'users', sid, 'progress', rid)));

export const watchProposals = (sid, status, cb, onError) =>
  onSnapshot(query(collection(db, 'users', sid, 'proposals'), where('status', '==', status)),
    (s) => cb(list(s).sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))), onError);

export async function listRecentProposals(sid, n = 80) {
  const snap = await getDocs(query(collection(db, 'users', sid, 'proposals'), orderBy('createdAtMs', 'desc'), limit(n)));
  return list(snap);
}

/** Guarda propuestas nuevas y marca como reemplazadas las pendientes de carga que ya no aplican. */
export async function writeProposals(sid, { creates = [], supersede = [], byUid, byRole }) {
  if (!creates.length && !supersede.length) return;
  const batch = writeBatch(db);
  for (const id of supersede) {
    batch.update(doc(db, 'users', sid, 'proposals', id), { status: 'superseded', decidedBy: byUid, decidedRole: byRole, decidedAt: stamp() });
  }
  for (const { id, data } of creates) {
    batch.set(doc(db, 'users', sid, 'proposals', id), { ...data, createdAt: stamp() });
  }
  await batch.commit();
}

/**
 * Decide una propuesta en un solo lote: estado + efectos (progreso, rutina) + historial.
 * Nada de esto se ejecuta sin que alguien toque "Aceptar" o "Rechazar".
 */
export async function decideProposal({ sid, proposalId, status, byUid, byRole, note = '', routineId, progressPatch, routinePatch, change }) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', sid, 'proposals', proposalId), {
    status, decidedBy: byUid, decidedRole: byRole, decidedAt: stamp(), decisionNote: note,
  });
  if (progressPatch && Object.keys(progressPatch).length) {
    batch.update(doc(db, 'users', sid, 'progress', routineId), { ...progressPatch, updatedAt: stamp() });
  }
  if (routinePatch) {
    batch.update(doc(db, 'users', sid, 'routines', routineId), { ...routinePatch, updatedAt: stamp() });
  }
  if (change) {
    batch.set(doc(collection(db, 'users', sid, 'changes')), {
      ...change, studentId: sid, routineId, proposalId, by: byUid, byRole, atMs: Date.now(), at: stamp(),
    });
  }
  await batch.commit();
}

export const watchWeekSessions = (sid, week, cb, onError) =>
  onSnapshot(query(collection(db, 'users', sid, 'sessions'), where('week', '==', week)), (s) => cb(list(s)), onError);

// ---------- Fase 4: PDF ----------
export const setRoutineAccent = (sid, rid, pdfAccent) =>
  updateDoc(doc(db, 'users', sid, 'routines', rid), { pdfAccent, updatedAt: stamp() });

// ---------- Altas desde la app: invitaciones, solicitudes y administrador ----------
const CODE_ABC = 'abcdefghjkmnpqrstuvwxyz23456789'; // sin letras que se confunden
export function newInviteCode(n = 14) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, (b) => CODE_ABC[b % CODE_ABC.length]).join('');
}

/** Crea un enlace de invitación. Alumno: del coach que lo crea. Coach: solo el admin. */
export async function createInvite(me, { role = 'student', name = '', email = '', maxUses = 1, days = 7 }) {
  const code = newInviteCode();
  const now = Date.now();
  await setDoc(doc(db, 'invites', code), {
    createdBy: me.id,
    trainerId: role === 'student' ? me.id : '',
    trainerName: String(me.name || '').slice(0, 80),
    role,
    name: String(name || '').trim().slice(0, 80),
    email: String(email || '').trim().toLowerCase().slice(0, 120),
    maxUses: Math.max(1, Math.min(50, Math.round(maxUses))),
    uses: 0,
    active: true,
    expiresAtMs: now + Math.max(1, Math.min(30, days)) * 86400000,
    createdAtMs: now,
    createdAt: stamp(),
  });
  return code;
}
export const getInvite = async (code) => one(await getDoc(doc(db, 'invites', code)));
export const watchMyInvites = (uid, cb, onError) =>
  onSnapshot(query(collection(db, 'invites'), where('createdBy', '==', uid)), (s) => cb(list(s).sort((a, b) => b.createdAtMs - a.createdAtMs)), onError);
export const deactivateInvite = (code) => updateDoc(doc(db, 'invites', code), { active: false });

/** La persona con sesión iniciada (sin perfil todavía) se une con el código. */
export async function redeemInvite(code, name) {
  const user = auth.currentUser;
  if (!user) throw new Error('Inicia sesión primero');
  const inv = await getInvite(code);
  if (!inv) throw new Error('Este enlace no existe');
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', user.uid), {
    role: inv.role,
    trainerId: inv.role === 'trainer' ? user.uid : inv.trainerId,
    name: String(name || '').trim().slice(0, 80) || user.email.split('@')[0],
    email: user.email.toLowerCase(),
    active: true,
    prefs: {},
    notes: '',
    invite: code,
    createdAt: stamp(),
    updatedAt: stamp(),
  });
  batch.update(doc(db, 'invites', code), { uses: inv.uses + 1, lastUsedBy: user.uid, lastUsedAt: stamp() });
  await batch.commit();
}

export function requestAccess(name) {
  const user = auth.currentUser;
  return setDoc(doc(db, 'accessRequests', user.uid), {
    email: user.email.toLowerCase(), name: String(name || '').trim().slice(0, 80), status: 'pending', createdAtMs: Date.now(), createdAt: stamp(),
  });
}
export const watchMyRequest = (uid, cb, onError) => onSnapshot(doc(db, 'accessRequests', uid), (s) => cb(one(s)), onError);
export const watchPendingRequests = (cb, onError) =>
  onSnapshot(query(collection(db, 'accessRequests'), where('status', '==', 'pending')), (s) => cb(list(s).sort((a, b) => a.createdAtMs - b.createdAtMs)), onError);

/** Admin: da el rol a quien pidió acceso (como alumno de un coach o como coach). */
export async function approveRequest(req, { role, trainerId, name }, me) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', req.id), {
    role,
    trainerId: role === 'trainer' ? req.id : trainerId,
    name: String(name || req.name || req.email.split('@')[0]).trim().slice(0, 80),
    email: req.email,
    active: true,
    prefs: {},
    notes: '',
    createdAt: stamp(),
    updatedAt: stamp(),
  });
  batch.update(doc(db, 'accessRequests', req.id), { status: 'approved', decidedBy: me.id, decidedAt: stamp() });
  await batch.commit();
}
export const rejectRequest = (req, me) => updateDoc(doc(db, 'accessRequests', req.id), { status: 'rejected', decidedBy: me.id, decidedAt: stamp() });

/** Admin: todos los coaches. */
export const watchTrainers = (cb, onError) =>
  onSnapshot(query(collection(db, 'users'), where('role', '==', 'trainer')), (s) => cb(list(s)), onError);

/** Lo que el entrenador corrigió al importar PDFs, para reconocerlo solo la próxima vez. */
export function saveImportAliases(uid, aliases) {
  const patch = { updatedAt: stamp() };
  for (const [k, v] of Object.entries(aliases)) patch[`prefs.importAliases.${k.replace(/[.~*/\[\]]/g, ' ').slice(0, 120)}`] = v;
  return updateDoc(doc(db, 'users', uid), patch);
}

// ---------- Fase 5: sincronización ----------
/** Se resuelve cuando todo lo que se guardó sin señal ya llegó al servidor. */
export const syncPending = () => waitForPendingWrites(db);
