// Pruebas del motor de progresión. Correr:  node --test tests/engine.test.js   (sin instalar nada)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classify, evaluateSlot, sessionTarget, workKg, variantsFor, substitutesFor, alreadyDecided, deloadPrescription,
} from '../js/engine/progression.js';
import { weeklyVolume, groupWeights } from '../js/engine/volume.js';
import { guard, GuardError } from '../js/engine/guard.js';
import { defaultIncrement } from '../js/engine/increments.js';

const bench = { id: 'bench', nameEs: 'Press de banca', pattern: 'press_horizontal', equipment: 'barra', region: 'superior', mechanic: 'compuesto', primary: ['chest'], secondary: ['shoulders', 'triceps'] };
const dbPress = { id: 'db', nameEs: 'Press plano con mancuernas', pattern: 'press_horizontal', equipment: 'mancuerna', region: 'superior', primary: ['chest'], secondary: ['triceps'] };
const machine = { id: 'mach', nameEs: 'Press de pecho en máquina', pattern: 'press_horizontal', equipment: 'maquina', region: 'superior', primary: ['chest'], secondary: [] };
const fly = { id: 'fly', nameEs: 'Aperturas', pattern: 'aperturas_pecho', equipment: 'mancuerna', region: 'superior', primary: ['chest'], secondary: [] };
const squat = { id: 'squat', nameEs: 'Sentadilla', pattern: 'sentadilla', equipment: 'barra', region: 'inferior', primary: ['quadriceps'], secondary: ['glutes', 'hamstrings'] };
const catalog = [bench, dbPress, machine, fly, squat];

const slot = { id: 's1', exId: 'bench', sets: 3, repMin: 8, repMax: 12, rir: 2, incrementKg: null };
const perf = (reps, rir, kg = 60, extra = {}) => ({ exId: 'bench', sessionId: `x${Math.random()}`, date: '2026-10-20', kg: reps.map(() => kg), reps, rir, pain: false, ...extra });

test('clasificación', () => {
  assert.equal(classify(perf([12, 12, 12], [2, 2, 1]), slot), 'top');
  assert.equal(classify(perf([12, 12, 12], [2, 1, 0]), slot), 'top_rir0');
  assert.equal(classify(perf([12, 12], [2, 2]), slot), 'in', 'si faltó una serie no es tope');
  assert.equal(classify(perf([10, 9, 8], [2, 2, 2]), slot), 'in');
  assert.equal(classify(perf([9, 7, 6], [1, 1, 0]), slot), 'below', '2 de 3 bajo el mínimo');
  assert.equal(classify(perf([10, 9, 7], [1, 1, 0]), slot), 'in', '1 de 3 bajo el mínimo no es "debajo"');
});

test('R1: tope con RIR ≥ 1 → +2.5 kg tren superior y regresa a 8 reps', () => {
  const [p] = evaluateSlot({ slot, exercise: bench, history: [perf([12, 12, 12], [2, 2, 1])], currentLoadKg: 60, catalog });
  assert.equal(p.rule, 'R1');
  assert.equal(p.scope, 'load');
  assert.deepEqual(p.to, { loadKg: 62.5, repTarget: 8 });
  assert.match(p.reason, /12\/12\/12 con RIR 2·2·1 → \+2\.5 kg/);
});

test('R1: tren inferior +5 kg; mancuerna usa su incremento; el slot manda si lo fijaste', () => {
  const sq = { ...slot, exId: 'squat' };
  const [p] = evaluateSlot({ slot: sq, exercise: squat, history: [{ ...perf([12, 12, 12], [1, 1, 1], 100), exId: 'squat' }], currentLoadKg: 100, catalog });
  assert.equal(p.to.loadKg, 105);
  assert.equal(defaultIncrement(dbPress), 2);
  const [q] = evaluateSlot({ slot: { ...slot, incrementKg: 1.25 }, exercise: bench, history: [perf([12, 12, 12], [1, 1, 1])], currentLoadKg: 60, catalog });
  assert.equal(q.to.loadKg, 61.3);
});

test('R1: tope con RIR 0 no sube', () => {
  assert.deepEqual(evaluateSlot({ slot, exercise: bench, history: [perf([12, 12, 12], [1, 1, 0])], currentLoadKg: 60, catalog }), []);
});

test('R2: dentro del rango → meta +1 rep con la misma carga', () => {
  const t = sessionTarget(slot, perf([10, 9, 8], [2, 2, 2]), 60);
  assert.deepEqual(t.reps, [11, 9, 8]);
  assert.match(t.text, /60 kg × 11 · 9 · 8/);
  assert.deepEqual(evaluateSlot({ slot, exercise: bench, history: [perf([10, 9, 8], [2, 2, 2])], currentLoadKg: 60, catalog }), [], 'R2 no genera propuesta');
});

test('R2: si la carga cambió (propuesta aceptada), la meta es llegar al mínimo', () => {
  const t = sessionTarget(slot, perf([12, 12, 12], [2, 2, 2]), 62.5);
  assert.match(t.text, /Carga nueva: 62\.5 kg/);
});

test('R3: debajo 2 sesiones seguidas → −5 %, redondeado al incremento', () => {
  const h = [perf([7, 6, 6], [1, 0, 0]), perf([8, 7, 6], [1, 1, 0])];
  const [p] = evaluateSlot({ slot, exercise: bench, history: h, currentLoadKg: 60, catalog });
  assert.equal(p.rule, 'R3');
  assert.equal(p.to.loadKg, 55, '60 × 0.95 = 57 → baja al múltiplo de 2.5 = 55');
  assert.match(p.reason, /−5 %/);
});

test('R3: si promedió 3+ reps abajo → −10 %', () => {
  const h = [perf([5, 4, 4], [0, 0, 0]), perf([5, 5, 4], [0, 0, 0])];
  const [p] = evaluateSlot({ slot, exercise: bench, history: h, currentLoadKg: 60, catalog });
  assert.match(p.reason, /−10 %/);
  assert.equal(p.to.loadKg, 52.5);
});

test('R3: una sola sesión debajo no baja carga', () => {
  assert.deepEqual(evaluateSlot({ slot, exercise: bench, history: [perf([7, 6, 6], [0, 0, 0]), perf([10, 9, 8], [2, 2, 2])], currentLoadKg: 60, catalog }), []);
});

test('R4: estancado 3 sesiones → variantes del mismo patrón + descarga', () => {
  const h = [perf([10, 9, 8], [1, 1, 1]), perf([10, 8, 8], [1, 1, 1]), perf([10, 9, 8], [1, 1, 1])];
  const [p] = evaluateSlot({ slot, exercise: bench, history: h, currentLoadKg: 60, catalog });
  assert.equal(p.rule, 'R4');
  assert.equal(p.scope, 'structure');
  assert.deepEqual(p.options.map((o) => o.exId || o.type), ['mach', 'db', 'deload'], 'mismo músculo y otro equipo, en orden alfabético; descarga al final');
  assert.ok(!p.options.some((o) => o.exId === 'fly'), 'aperturas no es el mismo patrón');
});

test('R4: si mejoró en alguna de las 3, no está estancado', () => {
  const h = [perf([11, 9, 8], [1, 1, 1]), perf([10, 9, 8], [1, 1, 1]), perf([10, 9, 8], [1, 1, 1])];
  assert.deepEqual(evaluateSlot({ slot, exercise: bench, history: h, currentLoadKg: 60, catalog }), []);
});

test('R5: molestia → sustituto, nunca sube carga aunque esté en el tope', () => {
  const [p] = evaluateSlot({ slot, exercise: bench, history: [perf([12, 12, 12], [2, 2, 2], 60, { pain: true })], currentLoadKg: 60, catalog });
  assert.equal(p.rule, 'R5');
  assert.equal(p.kind, 'substitute');
  assert.ok(p.options.length > 0 && p.options.every((o) => o.exId !== 'bench'));
  const flagged = evaluateSlot({ slot, exercise: bench, history: [perf([12, 12, 12], [2, 2, 2])], currentLoadKg: 60, flagged: true, catalog });
  assert.deepEqual(flagged, [], 'con la marca vigente, R1 no propone subir');
});

test('el historial de otro ejercicio o de descarga no cuenta', () => {
  const other = { ...perf([12, 12, 12], [2, 2, 2]), exId: 'otro' };
  const deload = perf([12, 12], [4, 4], 60, { deload: true });
  assert.deepEqual(evaluateSlot({ slot, exercise: bench, history: [deload, other], currentLoadKg: 60, catalog }), []);
});

test('no se repite una propuesta sobre la misma evidencia ya rechazada', () => {
  const h = [perf([12, 12, 12], [2, 2, 1])];
  const [p] = evaluateSlot({ slot, exercise: bench, history: h, currentLoadKg: 60, catalog });
  assert.equal(alreadyDecided(p, [{ slotId: 's1', rule: 'R1', evidence: { sessionIds: [h[0].sessionId] } }]), true);
  assert.equal(alreadyDecided(p, [{ slotId: 's1', rule: 'R1', evidence: { sessionIds: ['viejo'] } }]), false);
});

test('descarga: mitad de series, RIR +2, sin técnicas, misma carga', () => {
  const d = deloadPrescription({ ...slot, sets: 3, technique: { type: 'drop', applyTo: 'last' } });
  assert.equal(d.sets, 2);
  assert.equal(d.rir, 4);
  assert.equal(d.technique.type, 'none');
});

test('variantes y sustitutos', () => {
  assert.deepEqual(variantsFor(bench, catalog).map((e) => e.id).sort(), ['db', 'mach']);
  assert.ok(substitutesFor(bench, catalog).map((e) => e.id).includes('mach'));
  assert.equal(workKg({ kg: [60, 60, 45] }), 60, 'el drop set no baja la carga de trabajo');
});

test('R6: volumen semanal con principal 1, secundario 0.5 y RIR ≤ 4', () => {
  const get = (id) => catalog.find((e) => e.id === id);
  const sessions = [{ entries: [
    { exId: 'bench', sets: [{ done: true, rir: 2 }, { done: true, rir: 1 }, { done: true, rir: 5 }, { done: false }] },
    { exId: 'squat', sets: [{ done: true, rir: 2 }, { done: true, rir: 3 }] },
  ] }];
  const v = weeklyVolume(sessions, get);
  const by = Object.fromEntries(v.groups.map((g) => [g.id, g.sets]));
  assert.equal(by.pecho, 2, 'la serie con RIR 5 no es efectiva');
  assert.equal(by.hombro, 1);
  assert.equal(by.triceps, 1);
  assert.equal(by.cuadriceps, 2);
  assert.equal(by.gluteo, 1);
  assert.deepEqual(groupWeights({ primary: ['lats'], secondary: ['middle back', 'biceps'] }), { espalda: 1, biceps: 0.5 });
});

test('guardia: intensidad ≠ volumen', () => {
  const ok = { kind: 'load_up', scope: 'load', from: { loadKg: 60 }, to: { loadKg: 62.5 } };
  assert.equal(guard(ok, slot), ok);
  assert.throws(() => guard({ kind: 'add_exercise', scope: 'structure' }), GuardError);
  assert.throws(() => guard({ kind: 'load_up', scope: 'load', from: { loadKg: 60 }, to: { loadKg: 60, sets: 4 } }, slot), GuardError);
  assert.throws(() => guard({ kind: 'load_up', scope: 'load', from: { loadKg: 60 }, to: { loadKg: 62.5, technique: 'fst7' } }, slot), GuardError);
  assert.throws(() => guard({ kind: 'plateau', scope: 'structure', options: [{ type: 'add_set' }] }), GuardError);
  for (const p of [
    ...evaluateSlot({ slot, exercise: bench, history: [perf([12, 12, 12], [2, 2, 1])], currentLoadKg: 60, catalog }),
    ...evaluateSlot({ slot, exercise: bench, history: [perf([7, 6, 6], [0, 0, 0]), perf([7, 6, 6], [0, 0, 0])], currentLoadKg: 60, catalog }),
  ]) assert.doesNotThrow(() => guard(p, slot), 'todo lo que propone el motor pasa la guardia');
});
