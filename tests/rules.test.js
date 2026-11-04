// Pruebas de las reglas de Firestore contra el emulador local.
// Correr:  npm install  →  npm run test:rules     (requiere Node 20+ y Java 21+)
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, collectionGroup, query, where, getDocs, writeBatch,
} from 'firebase/firestore';

let env;
const GEO = 'geo';         // entrenador
const OTRO = 'otro-coach'; // otro entrenador
const JULI = 'juli';       // alumna de Geo
const CECI = 'ceci';       // alumna de Geo
const X = 'extrano';       // cuenta sin doc en users
const INV = 'inv-alumno-0001';
const INV_MULTI = 'inv-varios-0001';
const INV_OLD = 'inv-vencido-001';
const INV_COACH = 'inv-coach-00001';
const INV_OTRO = 'inv-otro-000001';

const as = (uid, email) => env.authenticatedContext(uid, email ? { email } : {}).firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-pushharder',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', GEO), { role: 'trainer', trainerId: GEO, name: 'Geo', email: 'geo@x.mx', active: true, admin: true });
    await setDoc(doc(db, 'users', OTRO), { role: 'trainer', trainerId: OTRO, name: 'Otro', email: 'o@x.mx', active: true });
    await setDoc(doc(db, 'users', JULI), { role: 'student', trainerId: GEO, name: 'Juli', email: 'j@x.mx', active: true });
    await setDoc(doc(db, 'users', CECI), { role: 'student', trainerId: GEO, name: 'Ceci', email: 'c@x.mx', active: true });
    await setDoc(doc(db, `users/${JULI}/routines/r1`), { studentId: JULI, trainerId: GEO, status: 'active', name: 'V4', days: [] });
    await setDoc(doc(db, `users/${JULI}/progress/r1`), { studentId: JULI, routineId: 'r1', loads: {}, recent: {}, flags: { s1: { note: 'hombro' } } });
    await setDoc(doc(db, `users/${JULI}/sessions/s1`), { studentId: JULI, trainerId: GEO, routineId: 'r1', dayId: 'd1', status: 'done' });
    await setDoc(doc(db, `users/${JULI}/proposals/pLoad`), { studentId: JULI, trainerId: GEO, scope: 'load', status: 'pending' });
    await setDoc(doc(db, `users/${JULI}/proposals/pStruct`), { studentId: JULI, trainerId: GEO, scope: 'structure', status: 'pending' });
    await setDoc(doc(db, `users/${JULI}/changes/c1`), { studentId: JULI, by: GEO, kind: 'manual_edit' });
    await setDoc(doc(db, 'exercises/c-hip'), { ownerId: GEO, nameEs: 'Hip thrust máquina' });
    const inv = { createdBy: GEO, trainerId: GEO, trainerName: 'Geo', role: 'student', name: '', email: '', maxUses: 1, uses: 0, active: true, expiresAtMs: Date.now() + 86400000, createdAtMs: Date.now() };
    await setDoc(doc(db, `invites/${INV}`), inv);
    await setDoc(doc(db, `invites/${INV_MULTI}`), { ...inv, maxUses: 5 });
    await setDoc(doc(db, `invites/${INV_OLD}`), { ...inv, expiresAtMs: Date.now() - 1000 });
    await setDoc(doc(db, `invites/${INV_COACH}`), { ...inv, trainerId: '', role: 'trainer', email: 'coach@x.mx' });
    await setDoc(doc(db, `invites/${INV_OTRO}`), { ...inv, createdBy: OTRO, trainerId: OTRO, trainerName: 'Otro' });
    await setDoc(doc(db, `accessRequests/${X}`), { email: 'x@x.mx', name: 'Extraño', status: 'pending', createdAtMs: 1 });
  });
});

// ---------- users ----------
test('alumna lee su perfil, no el de otra alumna', async () => {
  await assertSucceeds(getDoc(doc(as(JULI), 'users', JULI)));
  await assertFails(getDoc(doc(as(JULI), 'users', CECI)));
});

test('entrenador lista a sus alumnos; otro entrenador no', async () => {
  await assertSucceeds(getDocs(query(collection(as(GEO), 'users'), where('trainerId', '==', GEO))));
  await assertFails(getDoc(doc(as(OTRO), 'users', JULI)));
});

test('nadie se cambia rol ni entrenador', async () => {
  await assertFails(updateDoc(doc(as(JULI), 'users', JULI), { role: 'trainer' }));
  await assertFails(updateDoc(doc(as(JULI), 'users', JULI), { trainerId: OTRO }));
  await assertFails(updateDoc(doc(as(GEO), 'users', JULI), { role: 'trainer' }));
  await assertSucceeds(updateDoc(doc(as(JULI), 'users', JULI), { name: 'Julieta' }));
});

test('solo un entrenador da de alta alumnos, y como suyos', async () => {
  const nuevo = { role: 'student', trainerId: GEO, name: 'Emily', email: 'e@x.mx', active: true };
  await assertSucceeds(setDoc(doc(as(GEO), 'users', 'emily'), nuevo));
  await assertFails(setDoc(doc(as(JULI), 'users', 'emily2'), nuevo));
  await assertFails(setDoc(doc(as(X), 'users', X), { ...nuevo, role: 'trainer', trainerId: X }));
  await assertFails(setDoc(doc(as(OTRO), 'users', 'emily3'), { ...nuevo, trainerId: GEO })); // (el admin sí puede; ver abajo)
  await assertFails(setDoc(doc(as(GEO), 'users', 'emily4'), { ...nuevo, role: 'trainer' }));
});

// ---------- rutina ----------
test('la alumna lee su rutina pero no la edita; el entrenador sí', async () => {
  await assertSucceeds(getDoc(doc(as(JULI), `users/${JULI}/routines/r1`)));
  await assertFails(updateDoc(doc(as(JULI), `users/${JULI}/routines/r1`), { name: 'hack' }));
  await assertSucceeds(updateDoc(doc(as(GEO), `users/${JULI}/routines/r1`), { name: 'V5' }));
  await assertFails(getDoc(doc(as(CECI), `users/${JULI}/routines/r1`)));
  await assertFails(getDoc(doc(as(OTRO), `users/${JULI}/routines/r1`)));
});

// ---------- progreso ----------
test('la alumna actualiza cargas y agrega banderas, pero no quita una bandera', async () => {
  const ref = (uid) => doc(as(uid), `users/${JULI}/progress/r1`);
  await assertSucceeds(updateDoc(ref(JULI), { 'loads.s2': { loadKg: 60 } }));
  await assertSucceeds(updateDoc(ref(JULI), { 'flags.s3': { note: 'rodilla' } }));
  await assertFails(updateDoc(ref(JULI), { flags: {} }));
  await assertFails(updateDoc(ref(JULI), { deload: { active: true } }));
  await assertSucceeds(updateDoc(ref(GEO), { flags: {} }));
});

// ---------- sesiones ----------
test('sesiones: la alumna crea las suyas; el entrenador solo comenta', async () => {
  await assertSucceeds(setDoc(doc(as(JULI), `users/${JULI}/sessions/s2`), { studentId: JULI, trainerId: GEO, routineId: 'r1', dayId: 'd1', status: 'open' }));
  await assertFails(setDoc(doc(as(JULI), `users/${JULI}/sessions/s3`), { studentId: JULI, trainerId: OTRO, routineId: 'r1', dayId: 'd1', status: 'open' }));
  await assertFails(setDoc(doc(as(CECI), `users/${JULI}/sessions/s4`), { studentId: JULI, trainerId: GEO, routineId: 'r1', dayId: 'd1', status: 'open' }));
  await assertSucceeds(updateDoc(doc(as(GEO), `users/${JULI}/sessions/s1`), { coachNote: '¡Bien!' }));
  await assertFails(updateDoc(doc(as(GEO), `users/${JULI}/sessions/s1`), { status: 'open' }));
  await assertFails(deleteDoc(doc(as(JULI), `users/${JULI}/sessions/s1`)));
});

// ---------- propuestas ----------
const decide = (uid, status = 'accepted') => ({ status, decidedBy: uid, decidedRole: uid === GEO ? 'trainer' : 'student', decidedAt: new Date() });

test('la alumna decide propuestas de carga, no de estructura', async () => {
  await assertSucceeds(updateDoc(doc(as(JULI), `users/${JULI}/proposals/pLoad`), decide(JULI)));
  await assertFails(updateDoc(doc(as(JULI), `users/${JULI}/proposals/pStruct`), decide(JULI)));
  await assertSucceeds(updateDoc(doc(as(GEO), `users/${JULI}/proposals/pStruct`), decide(GEO)));
});

test('una propuesta decidida no se vuelve a decidir ni se borra', async () => {
  await assertSucceeds(updateDoc(doc(as(GEO), `users/${JULI}/proposals/pLoad`), decide(GEO, 'rejected')));
  await assertFails(updateDoc(doc(as(GEO), `users/${JULI}/proposals/pLoad`), decide(GEO, 'accepted')));
  await assertFails(deleteDoc(doc(as(GEO), `users/${JULI}/proposals/pLoad`)));
});

test('propuestas: no se puede cambiar el contenido al decidir', async () => {
  await assertFails(updateDoc(doc(as(JULI), `users/${JULI}/proposals/pLoad`), { ...decide(JULI), scope: 'structure' }));
});

// ---------- historial ----------
test('historial: solo agregar', async () => {
  await assertSucceeds(setDoc(doc(as(JULI), `users/${JULI}/changes/c2`), { studentId: JULI, by: JULI, kind: 'proposal_accepted' }));
  await assertFails(setDoc(doc(as(JULI), `users/${JULI}/changes/c3`), { studentId: JULI, by: GEO, kind: 'falso' }));
  await assertFails(updateDoc(doc(as(GEO), `users/${JULI}/changes/c1`), { kind: 'editado' }));
  await assertFails(deleteDoc(doc(as(GEO), `users/${JULI}/changes/c1`)));
});

// ---------- panel del entrenador (collection group) ----------
test('collection group: el entrenador ve propuestas de sus alumnos; otros no', async () => {
  await assertSucceeds(getDocs(query(collectionGroup(as(GEO), 'proposals'), where('trainerId', '==', GEO))));
  await assertFails(getDocs(query(collectionGroup(as(OTRO), 'proposals'), where('trainerId', '==', GEO))));
  await assertFails(getDocs(query(collectionGroup(as(CECI), 'proposals'), where('trainerId', '==', GEO))));
});

// ---------- ejercicios propios ----------
test('ejercicios propios: lectura pública, escritura solo del entrenador dueño', async () => {
  await assertSucceeds(getDoc(doc(anon(), 'exercises/c-hip')));
  await assertFails(setDoc(doc(as(JULI), 'exercises/c-nuevo'), { ownerId: JULI, nameEs: 'x' }));
  await assertSucceeds(setDoc(doc(as(GEO), 'exercises/c-nuevo'), { ownerId: GEO, nameEs: 'Remo hammer' }));
  await assertFails(updateDoc(doc(as(OTRO), 'exercises/c-hip'), { nameEs: 'hack' }));
  await assertFails(updateDoc(doc(as(GEO), 'exercises/c-hip'), { ownerId: OTRO }));
});

test('sin sesión no se lee nada privado', async () => {
  await assertFails(getDoc(doc(anon(), 'users', JULI)));
  await assertFails(getDoc(doc(anon(), `users/${JULI}/sessions/s1`)));
});

// ---------- Fase 2: plantillas, asignación y sesiones ----------
test('plantillas: solo el entrenador dueño las crea y lee', async () => {
  await assertSucceeds(setDoc(doc(as(GEO), 'templates/t1'), { trainerId: GEO, name: 'V9', days: [] }));
  await assertFails(setDoc(doc(as(JULI), 'templates/t2'), { trainerId: JULI, name: 'hack', days: [] }));
  await assertFails(getDoc(doc(as(JULI), 'templates/t1')));
  await assertFails(getDoc(doc(as(OTRO), 'templates/t1')));
  await assertSucceeds(getDocs(query(collection(as(GEO), 'templates'), where('trainerId', '==', GEO))));
});

test('asignar: el entrenador crea rutina + progreso; la alumna no puede crear su progreso', async () => {
  await assertSucceeds(setDoc(doc(as(GEO), `users/${CECI}/routines/r9`), { studentId: CECI, trainerId: GEO, status: 'active', name: 'V9', days: [] }));
  await assertSucceeds(setDoc(doc(as(GEO), `users/${CECI}/progress/r9`), { studentId: CECI, routineId: 'r9', loads: {}, recent: {}, flags: {} }));
  await assertFails(setDoc(doc(as(CECI), `users/${CECI}/progress/r10`), { studentId: CECI, routineId: 'r10', loads: {}, recent: {}, flags: {} }));
  await assertFails(setDoc(doc(as(OTRO), `users/${CECI}/routines/r11`), { studentId: CECI, trainerId: OTRO, status: 'active', name: 'x', days: [] }));
});

test('el entrenador también entrena: su propio árbol funciona como el de un alumno', async () => {
  await assertSucceeds(setDoc(doc(as(GEO), `users/${GEO}/routines/mine`), { studentId: GEO, trainerId: GEO, status: 'active', name: 'V9', days: [] }));
  await assertSucceeds(setDoc(doc(as(GEO), `users/${GEO}/sessions/x1`), { studentId: GEO, trainerId: GEO, routineId: 'mine', dayId: 'd1', status: 'open' }));
});

test('sesión: la alumna no puede moverla a otra rutina o día', async () => {
  await assertFails(updateDoc(doc(as(JULI), `users/${JULI}/sessions/s1`), { routineId: 'otra' }));
  await assertSucceeds(updateDoc(doc(as(JULI), `users/${JULI}/sessions/s1`), { current: 2, restEndMs: 123 }));
});

// ---------- Fase 3: el motor corre en el celular del alumno ----------
test('la alumna guarda las propuestas que genera su motor y reemplaza las de carga pendientes', async () => {
  const p = { studentId: JULI, trainerId: GEO, scope: 'load', status: 'pending', rule: 'R1', slotId: 's1' };
  await assertSucceeds(setDoc(doc(as(JULI), `users/${JULI}/proposals/nueva`), p));
  await assertFails(setDoc(doc(as(JULI), `users/${JULI}/proposals/trampa`), { ...p, status: 'accepted' }));
  await assertSucceeds(updateDoc(doc(as(JULI), `users/${JULI}/proposals/pLoad`), { status: 'superseded', decidedBy: JULI, decidedRole: 'student', decidedAt: new Date() }));
  await assertFails(updateDoc(doc(as(JULI), `users/${JULI}/proposals/pStruct`), { status: 'superseded', decidedBy: JULI, decidedRole: 'student', decidedAt: new Date() }));
});

test('aceptar una variante: solo el entrenador cambia la rutina', async () => {
  await assertFails(updateDoc(doc(as(JULI), `users/${JULI}/routines/r1`), { days: [{ id: 'd1', slots: [] }], version: 2 }));
  await assertSucceeds(updateDoc(doc(as(GEO), `users/${JULI}/routines/r1`), { days: [{ id: 'd1', slots: [] }], version: 2 }));
  await assertSucceeds(updateDoc(doc(as(GEO), `users/${JULI}/progress/r1`), { deload: { active: true, from: '2026-10-23', until: '2026-10-29' } }));
});


// ---------- Altas desde la app: invitaciones, solicitudes y admin ----------
function join(uid, email, code, data = {}) {
  const db = as(uid, email);
  const b = writeBatch(db);
  b.set(doc(db, 'users', uid), { role: 'student', trainerId: GEO, name: 'Nueva', email, active: true, invite: code, ...data });
  b.update(doc(db, 'invites', code), { uses: 1, lastUsedBy: uid, lastUsedAt: new Date() });
  return b.commit();
}

test('invitación de alumno: la persona se une sola y queda con su entrenador', async () => {
  await assertSucceeds(join('nuevo', 'nuevo@x.mx', INV));
  await assertSucceeds(getDoc(doc(as(GEO), 'users', 'nuevo')));
});

test('invitación de un solo uso no sirve dos veces', async () => {
  await assertSucceeds(join('nuevo', 'nuevo@x.mx', INV));
  await assertFails(join('otro2', 'otro2@x.mx', INV));
});

test('con invitación no se elige rol, entrenador ni correo', async () => {
  await assertFails(join('n1', 'n1@x.mx', INV, { role: 'trainer', trainerId: 'n1' }));
  await assertFails(join('n2', 'n2@x.mx', INV, { trainerId: OTRO }));
  await assertFails(join('n3', 'n3@x.mx', INV, { email: 'otro@x.mx' }));
  await assertFails(join('n4', 'n4@x.mx', INV, { admin: true }));
});

test('sin sumar el uso, o sin invitación, nadie se da de alta solo', async () => {
  const db = as('n5', 'n5@x.mx');
  await assertFails(setDoc(doc(db, 'users', 'n5'), { role: 'student', trainerId: GEO, name: 'N', email: 'n5@x.mx', active: true, invite: INV }));
  await assertFails(setDoc(doc(db, 'users', 'n5'), { role: 'student', trainerId: GEO, name: 'N', email: 'n5@x.mx', active: true }));
});

test('invitación vencida o desactivada no funciona', async () => {
  await assertFails(join('n6', 'n6@x.mx', INV_OLD));
  await assertSucceeds(updateDoc(doc(as(GEO), 'invites', INV_MULTI), { active: false }));
  await assertFails(join('n7', 'n7@x.mx', INV_MULTI));
});

test('invitación de entrenador: solo para el correo indicado', async () => {
  await assertFails(join('c1', 'intruso@x.mx', INV_COACH, { role: 'trainer', trainerId: 'c1' }));
  await assertSucceeds(join('c2', 'coach@x.mx', INV_COACH, { role: 'trainer', trainerId: 'c2' }));
});

test('invitación de otro entrenador deja al alumno con ese entrenador', async () => {
  await assertFails(join('n8', 'n8@x.mx', INV_OTRO));
  await assertSucceeds(join('n9', 'n9@x.mx', INV_OTRO, { trainerId: OTRO }));
});

test('crear invitaciones: coach para sus alumnos; solo el admin invita coaches', async () => {
  const base = { trainerName: 'x', name: '', email: '', maxUses: 1, uses: 0, active: true, expiresAtMs: Date.now() + 86400000, createdAtMs: Date.now() };
  await assertSucceeds(setDoc(doc(as(OTRO), 'invites/abcdefghij1'), { ...base, createdBy: OTRO, trainerId: OTRO, role: 'student' }));
  await assertFails(setDoc(doc(as(OTRO), 'invites/abcdefghij2'), { ...base, createdBy: OTRO, trainerId: '', role: 'trainer' }));
  await assertSucceeds(setDoc(doc(as(GEO), 'invites/abcdefghij3'), { ...base, createdBy: GEO, trainerId: '', role: 'trainer' }));
  await assertFails(setDoc(doc(as(JULI), 'invites/abcdefghij4'), { ...base, createdBy: JULI, trainerId: JULI, role: 'student' }));
  await assertFails(setDoc(doc(as(OTRO), 'invites/abcdefghij5'), { ...base, createdBy: OTRO, trainerId: GEO, role: 'student' }));
  await assertFails(setDoc(doc(as(OTRO), 'invites/abcdefghij6'), { ...base, createdBy: OTRO, trainerId: OTRO, role: 'student', uses: 3 }));
  await assertFails(setDoc(doc(as(OTRO), 'invites/corto'), { ...base, createdBy: OTRO, trainerId: OTRO, role: 'student' }));
});

test('invitaciones: el enlace se lee sin sesión, la lista solo su creador', async () => {
  await assertSucceeds(getDoc(doc(anon(), 'invites', INV)));
  await assertSucceeds(getDocs(query(collection(as(GEO), 'invites'), where('createdBy', '==', GEO))));
  await assertFails(getDocs(query(collection(as(OTRO), 'invites'), where('createdBy', '==', GEO))));
  await assertFails(updateDoc(doc(as(OTRO), 'invites', INV), { active: false }));
});

test('admin: da de alta coaches y alumnos de otros coaches; un coach normal no', async () => {
  await assertSucceeds(setDoc(doc(as(GEO), 'users', 'coach9'), { role: 'trainer', trainerId: 'coach9', name: 'Coach', email: 'c@x.mx', active: true }));
  await assertFails(setDoc(doc(as(OTRO), 'users', 'coach8'), { role: 'trainer', trainerId: 'coach8', name: 'Coach', email: 'c@x.mx', active: true }));
  await assertSucceeds(setDoc(doc(as(GEO), 'users', 'alu9'), { role: 'student', trainerId: OTRO, name: 'Alu', email: 'a@x.mx', active: true }));
  await assertFails(setDoc(doc(as(OTRO), 'users', 'alu8'), { role: 'student', trainerId: GEO, name: 'Alu', email: 'a@x.mx', active: true }));
});

test('admin: ve a los coaches y los pausa; nadie se pone admin', async () => {
  await assertSucceeds(getDocs(query(collection(as(GEO), 'users'), where('role', '==', 'trainer'))));
  await assertFails(getDocs(query(collection(as(OTRO), 'users'), where('role', '==', 'trainer'))));
  await assertSucceeds(updateDoc(doc(as(GEO), 'users', OTRO), { active: false }));
  await assertFails(updateDoc(doc(as(OTRO), 'users', GEO), { active: false }));
  await assertFails(updateDoc(doc(as(JULI), 'users', JULI), { admin: true }));
  await assertFails(updateDoc(doc(as(OTRO), 'users', OTRO), { admin: true }));
  await assertFails(updateDoc(doc(as(GEO), 'users', OTRO), { admin: true }));
  await assertFails(updateDoc(doc(as(GEO), 'users', OTRO), { role: 'student' }));
});

test('solicitudes: la persona pide acceso; solo el admin las ve y decide', async () => {
  await assertSucceeds(setDoc(doc(as('nuevo', 'nuevo@x.mx'), 'accessRequests', 'nuevo'), { email: 'nuevo@x.mx', name: 'Nuevo', status: 'pending', createdAtMs: 1 }));
  await assertFails(setDoc(doc(as('nuevo', 'nuevo@x.mx'), 'accessRequests', 'otro'), { email: 'nuevo@x.mx', name: 'Nuevo', status: 'pending', createdAtMs: 1 }));
  await assertFails(setDoc(doc(as('n2', 'n2@x.mx'), 'accessRequests', 'n2'), { email: 'falso@x.mx', name: 'N', status: 'pending', createdAtMs: 1 }));
  await assertFails(setDoc(doc(as(JULI, 'j@x.mx'), 'accessRequests', JULI), { email: 'j@x.mx', name: 'J', status: 'pending', createdAtMs: 1 }));
  await assertFails(setDoc(doc(as('n3', 'n3@x.mx'), 'accessRequests', 'n3'), { email: 'n3@x.mx', name: 'N', status: 'approved', createdAtMs: 1 }));
  await assertSucceeds(getDocs(query(collection(as(GEO), 'accessRequests'), where('status', '==', 'pending'))));
  await assertFails(getDocs(query(collection(as(OTRO), 'accessRequests'), where('status', '==', 'pending'))));
  await assertFails(getDoc(doc(as(JULI), 'accessRequests', X)));
  await assertSucceeds(updateDoc(doc(as(GEO), 'accessRequests', X), { status: 'approved', decidedBy: GEO, decidedAt: new Date() }));
  await assertFails(updateDoc(doc(as(X, 'x@x.mx'), 'accessRequests', X), { status: 'approved' }));
});
