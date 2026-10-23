/**
 * PDF "Historia" 9:16 de PUSH HARDER — definición de documento para pdfmake.
 * Módulo puro: recibe datos y recursos ya cargados (miniaturas en dataURL) y devuelve el
 * docDefinition. Todo el texto es texto real (seleccionable); solo las miniaturas son imagen.
 *
 * Estructura: portada → la semana → cada día (en partes si no cabe) → técnicas → progresión.
 */
import { WIDTHS } from './metrics.js';
import { variantsFor } from '../engine/progression.js';
import { VOLUME_GROUPS } from '../engine/volume.js';

export const PAGE = { width: 810, height: 1440 };
const M = 52;                       // margen lateral
const W = PAGE.width - M * 2;       // ancho útil
const C = {
  bg: '#1F2327', card: '#2A2F34', chip: '#2E3338', chipLine: '#464B50', rule: '#393D3F',
  text: '#EEEDE8', muted: '#9BA2A9', faint: '#6E757C', bar: '#7D858C',
};
// "El disco manda": cada técnica con el color de un disco olímpico.
export const DISCS = {
  none: { label: 'Series rectas', color: C.text, outline: true, desc: 'Todas las series iguales, técnica limpia y sin llegar al fallo. Así van los básicos pesados.' },
  drop: { label: 'Drop set', color: '#E0393E', desc: 'Cerca del fallo, baja el peso a la mitad sin descansar y sigue hasta el fallo.' },
  restpause: { label: 'Rest-pause', color: '#2E6BE6', desc: 'Llega al fallo, descansa 12 a 15 s y saca más reps con el mismo peso. Dos o tres veces.' },
  eccentric: { label: 'Excéntrica', color: '#F2B90C', desc: 'Controla la bajada en 3 s. La tensión en el estiramiento es la que hace crecer.' },
  partials: { label: 'Parciales', color: '#22A15E', desc: 'Cuando ya no salgan completas, sigue con reps cortas en el estiramiento hasta el fallo.' },
  superset: { label: 'Superserie', color: C.text, desc: 'Dos ejercicios seguidos sin descanso. Descansas al terminar el par.' },
  fst7: { label: 'FST-7', color: null, desc: '7 series de 8 a 12 con 30 a 45 s de descanso para bombear al máximo. Solo donde lo indica tu entrenador.' },
};
const SET_HINT = {
  drop: 'al fallo, baja el peso y sigue.',
  restpause: 'al fallo, pausa 12–15 s y más reps.',
  eccentric: 'baja en 3 s.',
  partials: 'al fallo y parciales en el estiramiento.',
};
const SHORT = { Abdomen: 'Abs', Aductor: 'Aductores' };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS = [['lunes', 'LUN'], ['martes', 'MAR'], ['miércoles', 'MIÉ'], ['miercoles', 'MIÉ'], ['jueves', 'JUE'], ['viernes', 'VIE'], ['sábado', 'SÁB'], ['sabado', 'SÁB'], ['domingo', 'DOM']];

// ---------- Utilidades ----------
const pad2 = (n) => String(n).padStart(2, '0');
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const lowerFirst = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const repRange = (s) => (s.repMin === s.repMax ? `${s.repMin}` : `${s.repMin}–${s.repMax}`);

/** Tamaño de letra para que `text` quepa en `width` (usa los anchos reales de la fuente). */
export function fitSize(text, font, width, max, min = 24) {
  const w = WIDTHS[font] || WIDTHS['BigShoulders-Black'];
  const em = [...text].reduce((t, ch) => t + (w[ch] ?? w[ch.toUpperCase()] ?? 0.45), 0) || 1;
  return Math.max(min, Math.min(max, Math.floor((width / em) * 0.98)));
}

/** Ancho en puntos de un texto en una fuente condensada (para columnas exactas). */
export function textWidth(text, font, size) {
  const w = WIDTHS[font] || WIDTHS['BigShoulders-Black'];
  return [...text].reduce((t, ch) => t + (w[ch] ?? w[ch.toUpperCase()] ?? 0.45), 0) * size;
}

function hexToRgb(h) { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const rgbToHex = (r, g, b) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
function lum(hex) {
  const a = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** Versión del acento que se lee bien sobre el fondo (mezcla hacia el blanco hasta 4.5:1). */
export function readableAccent(accent, bg = C.bg) {
  const a = hexToRgb(accent); const w = hexToRgb(C.text);
  for (let t = 0; t <= 1; t += 0.05) {
    const mix = rgbToHex(...a.map((v, i) => v + (w[i] - v) * t));
    if (contrast(mix, bg) >= 4.5) return mix;
  }
  return C.text;
}

const groupOf = (() => {
  const m = {};
  for (const [, label, muscles] of VOLUME_GROUPS) for (const mu of muscles) m[mu] = SHORT[label] || label;
  return (ex) => (ex?.primary?.[0] ? m[ex.primary[0]] : null);
})();

function weekdayLabel(name, i) {
  const n = (name || '').toLowerCase();
  const hit = WEEKDAYS.find(([w]) => n.includes(w));
  return hit ? hit[1] : pad2(i + 1);
}

// ---------- Paginación por altura estimada ----------
const PAGE_BUDGET = 960;   // alto útil para ejercicios bajo el encabezado del día (pt)
const lines = (text, size, width, em = 0.5) => (text ? Math.ceil((text.length * size * em) / width) : 0);

/** Alto aproximado de un bloque de ejercicio (para repartir el día en páginas sin desbordar). */
export function estimateBlock(slot, { desc = '', alt = '', media = true } = {}) {
  const width = media ? W - 66 - 150 - 24 : W - 66 - 12;
  const text = lines(slot.exName, 27, width, 0.52) * 29 + 74
    + lines(desc, 19, width, 0.49) * 23 + (alt ? lines(`Alternativa: ${alt}`, 15, width, 0.47) * 18 + 5 : 0);
  return Math.max(text, media ? 176 : 0) + 34;
}
export const estimateNote = (note) => (note ? 70 + lines(note, 20, W - 20, 0.5) * 25 : 0);

/**
 * Reparte alturas en el menor número de páginas que quepan y, con ese número, de la forma
 * más pareja posible (partición contigua que minimiza la página más llena).
 */
export function splitByHeight(heights, noteH = 0, budget = PAGE_BUDGET) {
  const n = heights.length;
  if (!n) return [0];
  const pre = [0]; for (const h of heights) pre.push(pre[pre.length - 1] + h);
  const sum = (i, j) => pre[j] - pre[i];
  for (let p = 1; p <= n; p++) {
    // dp[k][j]: mejor máximo usando k páginas para los primeros j bloques
    const dp = Array.from({ length: p + 1 }, () => Array(n + 1).fill(Infinity));
    const cut = Array.from({ length: p + 1 }, () => Array(n + 1).fill(0));
    dp[0][0] = 0;
    for (let k = 1; k <= p; k++) {
      for (let j = 1; j <= n; j++) {
        for (let i = k - 1; i < j; i++) {
          const load = sum(i, j) + (k === p && j === n ? noteH : 0);
          const v = Math.max(dp[k - 1][i], load);
          if (v < dp[k][j]) { dp[k][j] = v; cut[k][j] = i; }
        }
      }
    }
    if (dp[p][n] <= budget || p === n) {
      const sizes = []; let j = n;
      for (let k = p; k > 0; k--) { const i = cut[k][j]; sizes.unshift(j - i); j = i; }
      return sizes;
    }
  }
  return [n];
}

const hr = (top = 14, bottom = 14) => ({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: W, y2: 0, lineWidth: 1, lineColor: C.rule }], margin: [0, top, 0, bottom] });

function kicker(left, right) {
  return { columns: [{ text: left, font: 'Archivo', bold: true, fontSize: 30, color: C.text }, { text: right || '', fontSize: 20, color: C.muted, alignment: 'right', margin: [0, 9, 0, 0] }], margin: [0, 0, 0, 2] };
}
function bigTitle(text, max = 160) {
  const t = text.toUpperCase();
  return { text: t, font: 'BigShoulders', bold: true, fontSize: fitSize(t, 'BigShoulders-Black', W, max, 60), lineHeight: 0.86, color: C.text, margin: [0, -6, 0, 0] };
}
const subtitle = (text) => ({ text: text || ' ', fontSize: 22, color: C.muted, margin: [0, 2, 0, 0] });

function chip(type, label, accentText) {
  const d = DISCS[type] || DISCS.none;
  const color = d.color || accentText;
  const bar = d.outline
    ? { canvas: [{ type: 'rect', x: 0.75, y: 0.75, w: 7, h: 19, r: 2, lineColor: color, lineWidth: 1.5 }], width: 10 }
    : { canvas: [{ type: 'rect', x: 0, y: 0, w: 8, h: 20, r: 2, color }], width: 10 };
  return {
    table: { body: [[{ columns: [bar, { text: label || d.label, bold: true, fontSize: 18, color: C.text, margin: [8, 0, 0, 0], width: 'auto' }], columnGap: 0 }]] },
    layout: { hLineColor: C.chipLine, vLineColor: C.chipLine, hLineWidth: () => 1, vLineWidth: () => 1, paddingLeft: () => 9, paddingRight: () => 11, paddingTop: () => 5, paddingBottom: () => 4, fillColor: () => C.chip },
  };
}

// ---------- Páginas ----------
function cover(ctx) {
  const { routine, studentName, accentText, stats, date, techniques } = ctx;
  const first = (studentName || '').split(' ')[0] || 'ti';
  const push = 'PUSH'; const harder = 'HARDER';
  const ORDER = ['drop', 'restpause', 'eccentric', 'partials', 'superset', 'fst7'];
  const used = ORDER.filter((t) => techniques.includes(t));
  const plates = (used.length >= 2 ? used : ORDER.slice(0, 5)).slice(0, 5);
  const heights = [178, 164, 138, 112, 84];
  const barY = 96; let x = 360;
  const plateShapes = plates.map((t, i) => {
    const h = heights[i]; const color = DISCS[t].color || accentText;
    const shape = { type: 'rect', x, y: barY - h / 2, w: 32, h, r: 4, color };
    x += 38; return shape;
  });
  const lines = [
    [{ text: `${stats.days} días por semana`, bold: true }, ` y ${stats.sets} series a la semana.`],
    stats.top.length ? [{ text: stats.top.map((g, i) => (i ? lowerFirst(g) : g)).join(', ').replace(/, ([^,]*)$/, ' y $1'), bold: true }, ' con más volumen en tu semana.'] : null,
    techniques.filter((t) => t !== 'none').length
      ? [{ text: `${techniques.filter((t) => t !== 'none').length} técnicas de intensidad`, bold: true }, ` ${stats.allLast ? 'solo en la última serie' : 'donde más rinden'}; el resto, series rectas.`]
      : [{ text: 'Series rectas', bold: true }, ' en todo el programa: técnica limpia y progresión.'],
  ].filter(Boolean);

  return [
    { text: push, font: 'BigShoulders', bold: true, fontSize: fitSize(push, 'BigShoulders-Black', W, 360), lineHeight: 0.78, color: C.text, margin: [0, -18, 0, 0] },
    { text: harder, font: 'BigShoulders', bold: true, fontSize: fitSize(harder, 'BigShoulders-Black', W, 300), lineHeight: 0.78, color: accentText, margin: [0, 0, 0, 0] },
    {
      canvas: [
        { type: 'rect', x: 0, y: barY - 5, w: W, h: 10, color: C.bar },
        { type: 'rect', x: 330, y: barY - 22, w: 16, h: 44, r: 3, color: '#B7BDC2' },
        ...plateShapes,
        { type: 'rect', x: x + 2, y: barY - 18, w: 14, h: 36, r: 3, color: '#B7BDC2' },
      ],
      margin: [0, 34, 0, 40],
    },
    { text: routine.name || 'Rutina semanal', font: 'Archivo', bold: true, fontSize: fitSize(routine.name || 'Rutina semanal', 'BigShoulders-ExtraBold', W * 1.55, 54, 34), color: C.text },
    { text: `${cap(routine.goal || 'Tu programa')}, hecha para ${first}`, fontSize: 26, color: C.muted, margin: [0, 4, 0, 0] },
    hr(28, 0),
    ...lines.flatMap((l) => [{ text: l, fontSize: 21, color: C.text, lineHeight: 1.25, margin: [0, 18, 0, 0] }, hr(18, 0)]),
  ];
}

function weekPage(ctx) {
  const { routine, exIndex, accentText } = ctx;
  const days = routine.days;
  const rows = days.map((d, i) => {
    const groups = [...new Set(d.slots.map((s) => groupOf(exIndex.get(s.exId))).filter(Boolean))];
    const sets = d.slots.reduce((n, s) => n + s.sets, 0);
    return [
      { columns: [
        { text: weekdayLabel(d.name, i), font: 'BigShoulders', bold: true, fontSize: days.length > 6 ? 58 : 70, color: C.text, width: 130, lineHeight: 0.85 },
        { stack: [
          { text: d.focus || d.name, bold: true, fontSize: 29, color: C.text },
          { text: groups.slice(0, 4).join(' · ') || `${d.slots.length} ejercicios`, fontSize: 19, color: C.muted, margin: [0, 2, 0, 0] },
        ], margin: [0, 6, 0, 0] },
        { width: 'auto', stack: [chip('none', `${sets} series`, accentText)], margin: [0, 16, 0, 0] },
      ], columnGap: 10 },
      hr(16, 16),
    ];
  });

  // Veces por semana que entrena cada grupo (como músculo principal).
  const freq = {};
  for (const d of days) for (const g of new Set(d.slots.map((s) => groupOf(exIndex.get(s.exId))).filter(Boolean))) freq[g] = (freq[g] || 0) + 1;
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, days.length > 5 ? 3 : 6);
  const cells = top.map(([g, n]) => ({ stack: [{ text: String(n), font: 'BigShoulders', bold: true, fontSize: 64, color: C.text, lineHeight: 0.9 }, { text: g, fontSize: 20, color: C.text }], fillColor: C.card, margin: [14, 10, 10, 12] }));
  while (cells.length % 3) cells.push({ text: '', fillColor: C.bg });
  const grid = [];
  for (let i = 0; i < cells.length; i += 3) grid.push(cells.slice(i, i + 3));

  const quote = routine.notes || 'Las técnicas de intensidad van solo en la última serie, y nunca en los básicos pesados.';
  return [
    kicker('Tu semana', `${days.length} ${days.length === 1 ? 'día' : 'días'}`),
    bigTitle('La semana', 160),
    subtitle(routine.goal ? cap(routine.goal) : 'Tu plan de entrenamiento'),
    hr(22, 18),
    ...rows.flat(),
    grid.length ? { text: 'Veces por semana que entrena cada grupo', fontSize: 18, color: C.muted, margin: [0, 10, 0, 10] } : null,
    grid.length ? {
      table: { widths: ['*', '*', '*'], body: grid },
      layout: { hLineWidth: () => 12, vLineWidth: () => 12, hLineColor: C.bg, vLineColor: C.bg, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
      margin: [-12, -12, -12, 0],
    } : null,
    quoteBox(quote, accentText, 18),
  ].filter(Boolean);
}

function quoteBox(text, color, top = 24, title) {
  return {
    columns: [
      { canvas: [{ type: 'rect', x: 0, y: 0, w: 5, h: 58, color }], width: 22 },
      { stack: [title ? { text: title, bold: true, fontSize: 17, color: C.muted, margin: [0, 0, 0, 4] } : null, { text, fontSize: 20, color: C.text, lineHeight: 1.22 }].filter(Boolean) },
    ],
    margin: [0, top, 0, 0],
    unbreakable: true,
  };
}

/** Texto de la descripción y la alternativa de un ejercicio (lo usa el bloque y la paginación). */
function exerciseText(ctx, day, slot) {
  const { exIndex, catalog } = ctx;
  const ex = exIndex.get(slot.exId);
  const t = slot.technique?.type || 'none';
  const partner = slot.ssGroup ? day.slots.filter((s) => s.ssGroup === slot.ssGroup && s.id !== slot.id).map((s) => s.exName) : [];
  let techLine = '';
  if (t === 'superset') techLine = partner.length ? `Superserie con ${partner.join(' y ')}: sin descanso entre ambos.` : 'Superserie: sin descanso con el siguiente.';
  else if (t === 'fst7') techLine = slot.technique.detail || 'FST-7: 30–45 s de descanso entre series.';
  else if (t !== 'none') {
    const prefix = slot.technique.applyTo === 'all' ? 'Todas las series:' : 'Última serie:';
    techLine = `${prefix} ${slot.technique.detail ? lowerFirst(slot.technique.detail).replace(/\.?$/, '.') : SET_HINT[t]}`;
  }
  const desc = [slot.notes?.trim(), techLine].filter(Boolean).map((s) => s.replace(/\.?$/, '.')).join(' ');
  const alts = slot.alt?.trim()
    ? slot.alt.trim()
    : variantsFor(ex, catalog, 2).map((e, i) => (i ? lowerFirst(e.nameEs) : e.nameEs)).join(' o ');
  return { ex, t, desc, alts };
}

function exerciseBlock(ctx, day, slot, n) {
  const { thumbs, qrBase, accentText } = ctx;
  const { ex, t, desc, alts } = exerciseText(ctx, day, slot);
  const label = t === 'superset' ? `Superserie ${slot.ssGroup || ''}`.trim() : DISCS[t]?.label;
  const thumb = thumbs?.get(slot.exId);
  const qrUrl = qrBase && ex ? `${qrBase}${encodeURIComponent(ex.id)}` : null;

  const media = (thumb || qrUrl) ? {
    width: 150,
    stack: [
      thumb ? { image: thumb, width: 150, height: 100 } : null,
      qrUrl ? { columns: [
        { table: { body: [[{ qr: qrUrl, fit: 58, foreground: C.bg, background: C.text, eccLevel: 'M', margin: [0, 0, 0, 0] }]] }, layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 4, paddingBottom: () => 4, fillColor: () => C.text }, width: 'auto' },
        { text: 'Escanea y mira la animación', fontSize: 13, color: C.muted, margin: [8, 12, 0, 0], lineHeight: 1.15 },
      ], margin: [0, thumb ? 8 : 0, 0, 0] } : null,
    ].filter(Boolean),
  } : null;

  return {
    unbreakable: true,
    stack: [
      { columns: [
        { text: pad2(n), font: 'BigShouldersLight', fontSize: 46, color: accentText, width: 66, lineHeight: 0.9, margin: [0, -2, 0, 0] },
        { stack: [
          { text: slot.exName, bold: true, fontSize: 27, color: C.text, lineHeight: 1.08 },
          { columns: [
            { text: `${slot.sets}×${repRange(slot)}`, font: 'BigShoulders', bold: true, fontSize: 62, color: C.text, width: Math.ceil(textWidth(`${slot.sets}×${repRange(slot)}`, 'BigShoulders-Black', 62)) + 4, lineHeight: 0.9, noWrap: true },
            { stack: [chip(t, label, accentText), { text: `Descanso ${slot.restSec} s`, fontSize: 18, color: C.muted, margin: [2, 6, 0, 0] }], width: '*', margin: [16, 6, 0, 0] },
          ], margin: [0, 6, 0, 6] },
          desc ? { text: desc, fontSize: 19, color: C.text, lineHeight: 1.2 } : null,
          alts ? { text: `Alternativa: ${alts}`, italics: true, fontSize: 15, color: C.muted, margin: [0, 5, 0, 0] } : null,
        ].filter(Boolean) },
        media,
      ].filter(Boolean), columnGap: 12 },
      hr(16, 16),
    ],
  };
}

function dayPages(ctx, day) {
  const { exIndex, accentText } = ctx;
  const media = !!(ctx.thumbs?.size || ctx.qrBase);
  const heights = day.slots.map((s) => { const x = exerciseText(ctx, day, s); return estimateBlock(s, { desc: x.desc, alt: x.alts, media }); });
  const sizes = splitByHeight(heights, estimateNote(day.notes?.trim()));
  const pages = [];
  let from = 0;
  sizes.forEach((size, pi) => {
    const slots = day.slots.slice(from, from + size);
    const counts = {};
    for (const s of slots) { const g = groupOf(exIndex.get(s.exId)); if (g) counts[g] = (counts[g] || 0) + s.sets; }
    const title = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([g]) => g).join(' + ') || day.name;
    const content = [
      kicker(day.name, sizes.length > 1 ? `Parte ${pi + 1} de ${sizes.length}` : `${day.slots.length} ejercicios`),
      bigTitle(title, 160),
      subtitle(day.focus),
      hr(22, 18),
      ...slots.map((s, k) => exerciseBlock(ctx, day, s, from + k + 1)),
    ];
    if (!slots.length) content.push({ text: 'Día sin ejercicios todavía.', fontSize: 20, color: C.muted });
    if (pi === sizes.length - 1 && day.notes?.trim()) {
      content.push({
        table: { widths: ['*'], body: [[{ stack: [{ text: 'Nota del entrenador', bold: true, fontSize: 16, color: C.muted }, { text: day.notes.trim(), italics: true, fontSize: 20, color: C.text, lineHeight: 1.22, margin: [0, 6, 0, 0] }], margin: [10, 10, 10, 10] }]] },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => C.card },
        margin: [0, 10, 0, 0],
        unbreakable: true,
      });
    }
    pages.push(content);
    from += size;
  });
  return pages;
}

function techniquesPage(ctx) {
  const { techniques, accentText, stats } = ctx;
  const list = ['none', ...techniques.filter((t) => t !== 'none')];
  return [
    kicker('Técnicas', stats.allLast ? 'Solo en la última serie' : 'Cómo aplicarlas'),
    bigTitle('El disco manda', 160),
    subtitle('Cada técnica tiene el color de un disco olímpico'),
    hr(22, 18),
    ...list.flatMap((t) => {
      const d = DISCS[t]; const color = d.color || accentText;
      const disc = d.outline
        ? { canvas: [{ type: 'rect', x: 1, y: 1, w: 26, h: 84, r: 5, lineColor: color, lineWidth: 2.5 }], width: 56 }
        : { canvas: [{ type: 'rect', x: 0, y: 0, w: 28, h: 86, r: 5, color }], width: 56 };
      return [{ columns: [disc, { stack: [{ text: d.label, font: 'BigShoulders', fontSize: 54, color: C.text, lineHeight: 0.95 }, { text: d.desc, fontSize: 20, color: C.text, lineHeight: 1.22, margin: [0, 4, 0, 0] }] }], unbreakable: true }, hr(18, 18)];
    }),
  ];
}

function progressionPage(ctx) {
  const { accentText } = ctx;
  const rules = [
    ['01', 'Doble progresión', 'Cuando completas todas las series en el tope del rango con al menos 1 rep en reserva, subes carga (+2.5 kg arriba, +5 kg pierna) y regresas a la parte baja del rango.'],
    ['02', 'Una rep más', 'Dentro del rango: misma carga y busca una repetición más que la vez pasada. La app te marca la meta en cada serie.'],
    ['03', 'Ajusta la carga', 'Si quedas debajo del rango dos sesiones seguidas, se baja la carga 5 a 10 % para volver a trabajar con buena técnica.'],
    ['04', 'Cambia el estímulo', 'Tres sesiones sin mejorar: una variante del mismo movimiento o una semana de descarga con la mitad de series y sin técnicas.'],
    ['05', 'Escucha tu cuerpo', 'Si algo molesta, márcalo en la app. Tu entrenador lo ve, te propone un sustituto y ese ejercicio no sube de carga.'],
  ];
  return [
    kicker('Progresión', 'Con cada sesión'),
    bigTitle('Así subes', 160),
    subtitle('Registra tus series en la app y tu rutina se ajusta contigo'),
    hr(22, 16),
    ...rules.flatMap(([n, t, d]) => [{ columns: [
      { text: n, font: 'BigShoulders', bold: true, fontSize: 70, color: C.text, width: 110, lineHeight: 0.85 },
      { stack: [{ text: t, font: 'BigShoulders', fontSize: 44, color: C.text, lineHeight: 0.95 }, { text: d, fontSize: 19.5, color: C.text, lineHeight: 1.22, margin: [0, 4, 0, 0] }] },
    ], unbreakable: true }, hr(14, 14)]),
    {
      table: { widths: ['*'], body: [[{ stack: [{ text: 'Regla de oro', font: 'BigShoulders', fontSize: 40, color: C.bg }, { text: 'Nada cambia sin aprobación: cada ajuste llega como propuesta con su motivo, y la carga sube solo con técnica limpia.', bold: true, fontSize: 20, color: C.bg, lineHeight: 1.2, margin: [0, 4, 0, 0] }], margin: [12, 10, 12, 12] }]] },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => C.text },
      margin: [0, 8, 0, 0], unbreakable: true,
    },
    quoteBox('Si bajan tu sueño, tu fuerza o tu ánimo, avísale a tu entrenador: esa semana se quitan las técnicas y vuelves a series rectas.', accentText, 20),
  ];
}

// ---------- Documento ----------
/**
 * @param {Object} o
 * @param {Object} o.routine       { name, goal, notes, days[] }
 * @param {string} o.studentName
 * @param {Map}    o.exIndex       exId → ficha del catálogo
 * @param {Object[]} o.catalog     catálogo completo (para alternativas)
 * @param {Map}    [o.thumbs]      exId → dataURL JPEG de la miniatura
 * @param {string} [o.qrBase]      URL base para los QR (…/#/ej/)
 * @param {string} [o.accent]      color del alumno (#572364 por defecto)
 * @param {Date}   [o.date]
 */
export function buildDoc({ routine, studentName, exIndex, catalog = [], thumbs, qrBase, accent = '#572364', date = new Date() }) {
  const accentText = readableAccent(accent);
  const all = routine.days.flatMap((d) => d.slots);
  const techniques = [...new Set(all.map((s) => s.technique?.type || 'none'))];
  const groupSets = {};
  for (const s of all) { const g = groupOf(exIndex.get(s.exId)); if (g) groupSets[g] = (groupSets[g] || 0) + s.sets; }
  const stats = {
    days: routine.days.length,
    sets: all.reduce((n, s) => n + s.sets, 0),
    top: Object.entries(groupSets).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g),
    allLast: all.every((s) => ['none', 'superset', 'fst7'].includes(s.technique?.type || 'none') || s.technique.applyTo !== 'all'),
  };
  const ctx = { routine, studentName, exIndex, catalog, thumbs, qrBase, accentText, stats, techniques, date };

  const pages = [cover(ctx), weekPage(ctx), ...routine.days.flatMap((d) => dayPages(ctx, d)), techniquesPage(ctx), progressionPage(ctx)];
  const content = pages.flatMap((p, i) => (i === 0 ? p : [{ stack: p, pageBreak: 'before' }]));

  return {
    pageSize: PAGE,
    pageMargins: [M, 128, M, 64],
    info: { title: `${routine.name} · ${studentName || ''}`.trim(), author: 'PUSH HARDER · Personal training', creator: 'PUSH HARDER App' },
    defaultStyle: { font: 'Archivo', fontSize: 19, color: C.text, lineHeight: 1.15 },
    background: () => ({ canvas: [{ type: 'rect', x: 0, y: 0, w: PAGE.width, h: PAGE.height, color: C.bg }] }),
    header: (page, count) => ({
      stack: [
        { columns: [
          { text: 'PUSH HARDER', font: 'BigShoulders', fontSize: 28, color: C.text },
          { text: [{ text: pad2(page), color: C.text }, { text: `/${pad2(count)}`, color: accentText }], font: 'BigShoulders', fontSize: 28, alignment: 'right' },
        ] },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: W, y2: 0, lineWidth: 1, lineColor: C.rule }], margin: [0, 12, 0, 0] },
      ],
      margin: [M, 46, M, 0],
    }),
    footer: (page, count) => {
      if (page === 1) {
        return { columns: [{ text: 'Personal training', fontSize: 18, color: C.muted }, { text: `${cap(MESES[date.getMonth()])} ${date.getFullYear()}`, fontSize: 18, color: C.muted, alignment: 'right' }], margin: [M, 4, M, 0] };
      }
      if (page === count) {
        return { text: 'Calienta 5 a 10 min antes de cada sesión, estira al terminar, duerme 7 a 9 horas y come proteína suficiente.', fontSize: 16, color: C.muted, lineHeight: 1.2, margin: [M, 0, M, 0] };
      }
      return null;
    },
    content,
  };
}

/** Familias de letra que espera el documento (rutas relativas a la app). */
export const FONT_FILES = {
  Archivo: { normal: 'Archivo-Regular.ttf', bold: 'Archivo-SemiBold.ttf', italics: 'Archivo-Italic.ttf', bolditalics: 'Archivo-SemiBoldItalic.ttf' },
  BigShoulders: { normal: 'BigShoulders-ExtraBold.ttf', bold: 'BigShoulders-Black.ttf', italics: 'BigShoulders-ExtraBold.ttf', bolditalics: 'BigShoulders-Black.ttf' },
  BigShouldersLight: { normal: 'BigShoulders-Light.ttf', bold: 'BigShoulders-Light.ttf', italics: 'BigShoulders-Light.ttf', bolditalics: 'BigShoulders-Light.ttf' },
};
