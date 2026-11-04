// Lector de rutinas en PDF (formato PushHarder y parecidos). Puro: recibe renglones de lines.js.
//
// Reconoce, sin importar el diseño exacto:
//   días ("Lunes", "DÍA 01 · LUNES", "Día A"), ejercicios numerados ("01 Press inclinado…"),
//   series × reps ("4×8–10", "3 × 12 + fallo"), descanso ("Descanso 90–120 s", "DESC 60s"),
//   técnica (Drop set, Rest-pause, Excéntrica, Tempo, Parciales, Superserie, FST-7…),
//   alternativa ("Alternativa: …", "↳ Alt · …") y la nota del entrenador de cada día.
// Lo que no entiende lo deja como nota para que el entrenador lo revise antes de guardar.

const WEEKDAYS = [
  ['LUNES', 'Lunes'], ['MARTES', 'Martes'], ['MIERCOLES', 'Miércoles'], ['JUEVES', 'Jueves'],
  ['VIERNES', 'Viernes'], ['SABADO', 'Sábado'], ['DOMINGO', 'Domingo'],
];
const SHORT_DAYS = { LUN: 'Lunes', MAR: 'Martes', MIE: 'Miércoles', JUE: 'Jueves', VIE: 'Viernes', SAB: 'Sábado', DOM: 'Domingo' };

// Etiqueta (compacta) → técnica de la app + texto que se conserva en la nota.
const TECH = [
  ['SERIESRECTAS', 'none', ''], ['RECTAS', 'none', ''],
  ['SERIESASCENDENTES', 'none', 'Series ascendentes'], ['PESADAS', 'none', 'Series pesadas'],
  ['DROPSET', 'drop', ''], ['DROP', 'drop', ''],
  ['RESTPAUSE', 'restpause', ''],
  ['EXCENTRICALENTA', 'eccentric', ''], ['EXCENTRICA', 'eccentric', ''],
  ['TEMPO', 'eccentric', 'Tempo'],
  ['ISOMETRIA', 'none', 'Isometría'],
  ['PARCIALES', 'partials', ''],
  ['SUPERSERIE', 'superset', ''], ['BISERIE', 'superset', ''],
  ['FST7', 'fst7', ''],
];

export const strip = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
export const compact = (s) => strip(s).toUpperCase().replace(/[^A-Z0-9]/g, '');

/** "D Í A 0 1 · L U N E S" → "DÍA01 · LUNES" (texto con letras espaciadas). */
export function despace(text) {
  const toks = String(text || '').split(' ');
  const out = [];
  let run = [];
  const flush = () => {
    const single = run.filter((t) => t.length === 1).length / (run.length || 1);
    const lower = run.some((t) => /[a-zà-ÿ]/.test(t));
    // MAYÚSCULAS espaciadas ("P E S A D A S"): 3+ piezas. Minúsculas ("N i v e l"): 5+ letras sueltas.
    const join = lower ? run.length >= 5 && single >= 0.8 : run.length >= 3 && single >= 0.6;
    if (join) out.push(run.join(''));
    else out.push(...run);
    run = [];
    return undefined;
  };
  const kind = (t) => (/[a-zà-ÿ]/.test(t) ? 'l' : /[A-ZÀ-Þ]/.test(t) ? 'u' : 'n');
  let runKind = 'n';
  for (const t of toks) {
    if (t.length > 0 && t.length <= 2 && !/^\d{2}$/.test(t)) {
      const k = kind(t);
      // No mezclar "T E M P O" con la "s" de "3 s bajando".
      // (Una mayúscula sola seguida de minúsculas es inicio de palabra: "N i v e l".)
      const capStart = runKind === 'u' && k === 'l' && run.length === 1;
      if (k !== 'n' && runKind !== 'n' && k !== runKind && !capStart) { flush(); runKind = 'n'; }
      if (k !== 'n') runKind = k;
      run.push(t);
    } else { flush(); runKind = 'n'; if (t) out.push(t); }
  }
  flush();
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

const NUM = '(\\d{1,2}|fallo|f)';
const SETS_RE = new RegExp(`(\\d{1,2})\\s*[x×X]\\s*${NUM}(?:\\s*(?:[-–—]|a)\\s*(\\d{1,2}))?(?:\\s*\\+\\s*${NUM}(?:\\s*[-–—]\\s*(\\d{1,2}))?)?`, 'i');
const REST_RE = /(?:descanso|desc)\s*:?\s*(\d{1,3})(?:\s*[-–—:]\s*(\d{1,3}))?\s*(s|seg|segundos|min|minutos|'|”|″)?/i;
const SERIES_WORDS_RE = /(\d{1,2})\s*series?\s*(?:de)?\s*(\d{1,2})(?:\s*(?:[-–—]|a)\s*(\d{1,2}))?\s*(?:reps?|repeticiones)?/i;
const RIR_RE = /\bRIR\s*(\d)/i;
const ALT_RE = /^(?:↳\s*)?alt(?:ernativa)?\s*[:·.-]\s*(.+)$/i;
const HEADER_RE = /^(\d{1,2})\s*[.)-]?\s*(.+)$/;

const reps = (v) => (v == null ? null : /^f/i.test(v) ? 'fallo' : Number(v));

/** Lee "4×8–10 + 12–15" → { sets, parts: [{min,max,fallo}] } */
export function parseSets(text) {
  let m = text.match(SETS_RE);
  if (m) {
    const part = (a, b) => {
      const ra = reps(a); const rb = reps(b);
      if (ra === 'fallo') return { min: 10, max: 20, fallo: true };
      return { min: ra, max: rb && rb !== 'fallo' ? Math.max(ra, rb) : ra, fallo: false };
    };
    const parts = [part(m[2], m[3])];
    if (m[4]) parts.push(part(m[4], m[5]));
    // "2 × 1 min" / "2 × 30-45\"" → por tiempo
    const after = text.slice(m.index + m[0].length);
    const tu = after.match(/^\s*(min|minutos|seg|segundos|s\b|"|”|″)/i);
    let raw = m[0];
    if (tu) { raw += tu[0]; for (const p of parts) p.unit = /^m/i.test(tu[1]) ? 'min' : 's'; }
    return { sets: Number(m[1]), parts, raw, index: m.index };
  }
  m = text.match(SERIES_WORDS_RE);
  if (m) {
    const a = Number(m[2]); const b = m[3] ? Number(m[3]) : a;
    return { sets: Number(m[1]), parts: [{ min: a, max: Math.max(a, b), fallo: false }], raw: m[0], index: m.index };
  }
  return null;
}

export function parseRest(text) {
  const m = text.match(REST_RE);
  if (!m) return null;
  const unit = (m[3] || 's').toLowerCase();
  const toSec = (n) => (unit.startsWith('min') || unit === "'" ? Number(n) * 60 : Number(n));
  // "1:30 min"
  if (m[2] && text.slice(m.index, m.index + m[0].length).includes(':')) return Number(m[1]) * 60 + Number(m[2]);
  const a = toSec(m[1]); const b = m[2] ? toSec(m[2]) : a;
  return Math.max(a, b);
}

/** Técnica al inicio de un renglón: "Drop set", "R E S T - PA U S E Última serie…" */
export function parseTechnique(text) {
  const words = text.split(' ');
  // Prueba prefijos de 1 a 3 palabras para separar la etiqueta de la nota que sigue.
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    const head = compact(words.slice(0, n).join(' '));
    const hit = TECH.find(([k]) => head === k);
    if (hit) return { type: hit[1], label: hit[2], rest: words.slice(n).join(' ').trim() };
  }
  // "TEMPO3 s bajando" (letras espaciadas pegadas a un número)
  const first = compact(words[0] || '');
  const glued = TECH.find(([k]) => first.startsWith(k) && /^\d+$/.test(first.slice(k.length)));
  if (glued) return { type: glued[1], label: glued[2], rest: `${first.slice(glued[0].length)} ${words.slice(1).join(' ')}`.trim() };
  return null;
}

/** ¿El renglón abre un día? Devuelve { name, rest } o null. */
export function parseDay(text) {
  const plain = strip(text).trim();
  // "DÍA 01 · LUNES …" / "DÍA 3" / "Día A" (no "Día fuerte de deltoide")
  const m = plain.match(/^d\s*i\s*a\s*(\d\s*\d?|[A-F])(?![a-z])(.*)$/i);
  if (m) {
    const id = m[1].replace(/\s/g, '');
    const restC = compact(m[2]);
    const wd = WEEKDAYS.find(([k]) => restC.startsWith(k));
    const tag = `D${/^\d/.test(id) ? Number(id) : id.toUpperCase()}`;
    if (wd) return { name: wd[1], tag };
    return { name: /^\d/.test(id) ? `Día ${Number(id)}` : `Día ${id.toUpperCase()}`, tag, open: true };
  }
  const c = compact(text);
  // "Lunes Parte 1 de 2" o "VIERNES" solo; no "martes." dentro de una nota.
  if (!/^[A-ZÁÉÍÓÚ]/.test(plain) || /[.,;:]$/.test(plain)) return null;
  const wd = WEEKDAYS.find(([k]) => c === k || (c.startsWith(k) && /^(PARTE\d|\d{1,2}DE\d|$)/.test(c.slice(k.length))));
  if (wd) return { name: wd[1], tag: wd[0] };
  return null;
}

const BOILER = [
  /^PUSHHARDER\d*$/, /^PUSHHARDER\d{2}\d{2}$/, /^PUSH$/, /^HARDER$/, /ESCANEAYMIRA/, /^LAANIMACION$/, /^ANIMACION$/,
  /^EJERCICIOSSERIES/, /^SERIESTOTALES/, /^RUTINASEMANALDIA/, /^PERSONALTRAINING/, /^BUILDSHAPESTRENGTH/, /^\d{1,2}\d{2}$/,
];
const isBoiler = (c) => !c || BOILER.some((re) => re.test(c));
const STOP_PAGES = /^(TECNICAS|ELDISCOMANDA|PROGRESION|SEMANAASEMANA|ASISUBES|GLOSARIO)/;

/** Rótulo de grupo o de sección: todo en mayúsculas, corto y sin números. */
export const isGroupLabel = (t) => {
  const s = String(t || '').trim();
  return s.length <= 32 && /^[A-ZÁÉÍÓÚÜÑ&+·/ ]+$/.test(s) && s.split(/\s+/).length <= 4 && !parseTechnique(s);
};

const titleCase = (s) => {
  const t = String(s || '').trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/**
 * @param {{pages:{page:number, lines:{text:string,size:number,page:number}[]}[], meta?:Object, fileName?:string}} doc
 * @returns {{ name:string, goal:string, notes:string, days:Object[], warnings:string[] }}
 */
export function parseRoutine(doc) {
  const warnings = [];
  const days = [];
  const overview = {}; // "Lunes" → "Espalda + bíceps" (página "Tu semana")
  let day = null;
  let block = null;
  let noteMode = false;
  let group = '';
  let bodySize = 10;

  const allLines = doc.pages.flatMap((p) => p.lines.map((l) => ({ ...l, text: despace(l.text) })));
  if (allLines.length) {
    const sizes = allLines.map((l) => Math.round(l.size)).sort((a, b) => a - b);
    bodySize = sizes[Math.floor(sizes.length / 2)] || 10;
  }

  const closeBlock = () => {
    if (block && day) {
      if (block.sets) day.blocks.push(block);
      else if (block.name) warnings.push(`"${block.name}" (${day.name}) no trae series × reps; revísalo.`);
    }
    block = null;
  };
  const openDay = (name, tag) => {
    closeBlock();
    noteMode = false;
    const prev = days[days.length - 1];
    if (prev && prev.name === name) { day = prev; return; } // "Parte 2 de 2"
    day = { name, tag, focus: '', notes: '', blocks: [], titles: [] };
    days.push(day);
  };

  for (const pg of doc.pages) {
    closeBlock();
    noteMode = false;
    group = '';
    const lines = pg.lines.map((l) => ({ ...l, text: despace(l.text) }));
    const firstReal = lines.find((l) => !isBoiler(compact(l.text)));
    if (firstReal && STOP_PAGES.test(compact(firstReal.text))) continue;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const text = line.text.trim();
      const c = compact(text);
      if (isBoiler(c)) continue;

      // Resumen de la semana: "LUN Espalda + bíceps"
      const ov = despace(line.cells?.[0]?.text || text).match(/^(LUN|MAR|MI[EÉ]|JUE|VIE|S[AÁ]B|DOM)\.?\s+(.+)$/);
      if (ov && !day) { overview[SHORT_DAYS[compact(ov[1])]] = ov[2].trim(); continue; }

      const d = parseDay(text);
      if (d) {
        openDay(d.name, d.tag);
        // En el formato "DÍA 01 · INICIO DE SEMANA", el día de la semana viene en el renglón siguiente.
        if (d.open) {
          const nx = lines[i + 1] && compact(lines[i + 1].text);
          const wd = nx && WEEKDAYS.find(([k]) => nx.startsWith(k));
          if (wd) { day.name = wd[1]; i++; }
        }
        continue;
      }
      if (!day) continue;

      // Nota del entrenador / antes de empezar / cardio → notas del día
      if (/^(NOTADEL|NOTADELENTRENADOR|ANTESDEEMPEZAR|NOTA)/.test(c) && c.length < 40 + (text.length - c.length) * 3) {
        closeBlock();
        noteMode = true;
        const body = text.replace(/^\s*(n\s*o\s*t\s*a\s*(d\s*e\s*l)?(\s*entrenador)?|antes de empezar)\s*:?/i, '').replace(/^NOTADEL\s*/i, '').trim();
        if (body && compact(body) !== 'ENTRENADOR') day.notes += (day.notes ? ' ' : '') + body;
        continue;
      }
      if (/^CARDIO/.test(c)) {
        closeBlock();
        day.notes += `${day.notes ? '\n' : ''}${titleCase(text.replace(/\s{2,}/g, ' · '))}`;
        continue;
      }

      // Encabezado de ejercicio: "01 Press inclinado con mancuernas [3 × 8–10]"
      const h = text.match(HEADER_RE);
      if (h && Number(h[1]) >= 1 && Number(h[1]) <= 40 && /^[A-Za-zÁÉÍÓÚÑ¿(]/.test(h[2]) && /[a-záéíóúñ]/.test(h[2])) {
        const sets = parseSets(h[2]);
        // Debe aparecer series × reps aquí o antes del siguiente encabezado.
        let ok = !!sets;
        for (let j = i + 1; !ok && j < Math.min(lines.length, i + 7); j++) {
          const t = lines[j].text;
          if (/^\d{1,2}\s*[.)-]?\s*[A-Za-zÁÉÍÓÚÑ¿(]/.test(t) && /[a-záéíóúñ]/.test(t)) break; // el siguiente ejercicio
          if (parseSets(t)) ok = true;
        }
        if (ok) {
          closeBlock();
          noteMode = false;
          let name = (sets ? h[2].slice(0, sets.index) : h[2]).trim();
          // Nombre en dos renglones (mismo tamaño de letra, empieza en minúscula)
          const nx = lines[i + 1];
          if (!sets && nx && /^[a-záéíóúñ]/.test(nx.text) && !parseSets(nx.text) && !parseRest(nx.text)) {
            name += ` ${nx.text.trim()}`;
            i++;
          }
          block = { num: Number(h[1]), name: name.replace(/\s+/g, ' ').trim(), sets: sets || null, rest: null, tech: null, notes: [], alt: '', rir: null, group };
          const rs = parseRest(h[2]);
          if (rs) block.rest = rs;
          continue;
        }
      }

      if (noteMode && !block) {
        if (compact(text) !== 'ENTRENADOR') day.notes += (day.notes ? ' ' : '') + text.replace(/^ENTRENADOR\s+/, '');
        continue;
      }

      // Títulos del día (antes del primer ejercicio): "ESPALDA", "GLÚTEO & FEMORAL", "Anchura dorsal…"
      if (!block) {
        if (isGroupLabel(text)) group = text;
        const cell = line.cells?.[0];
        const left = !cell || !pg.width || cell.x < pg.width * 0.6;
        if (!day.blocks.length && day.titles.length < 6 && text.length <= 60 && left) {
          day.titles.push({ text: despace(cell?.text || text), size: cell?.size || line.size });
        }
        continue;
      }

      // Dentro de un ejercicio. Un rótulo en MAYÚSCULAS ("FEMORAL", "ABDUCTORES") es el grupo que sigue.
      if (isGroupLabel(text)) { group = text; continue; }
      let t = text;
      const st = !block.sets && parseSets(t);
      if (st) { block.sets = st; t = (t.slice(0, st.index) + t.slice(st.index + st.raw.length)).trim(); }
      const rs = parseRest(t);
      if (rs) { block.rest = rs; t = t.replace(REST_RE, '').trim(); }
      const tq = !block.tech && parseTechnique(t);
      if (tq) { block.tech = tq; t = tq.rest; }
      const rir = t.match(RIR_RE);
      if (rir) block.rir = Number(rir[1]);
      const alt = t.match(ALT_RE);
      if (alt) { block.alt = alt[1].replace(/\s*\/\s*/g, ' o ').trim(); continue; }
      if (t && !/^(series?|reps?|descanso)$/i.test(t)) block.notes.push(t);
    }
  }
  closeBlock();

  // Enfoque de cada día: resumen de la semana, o los títulos de sus páginas.
  for (const d of days) {
    if (overview[d.name]) d.focus = overview[d.name];
    else {
      // Junta títulos partidos ("GLÚTEO +" / "05 ABDOMEN") y se queda con el de letra más grande.
      const joined = [];
      for (const x of d.titles) {
        const t = x.text.replace(/^\d{1,2}\s*/, '').trim();
        const prev = joined[joined.length - 1];
        if (prev && /[+&]$/.test(prev.text)) { prev.text = `${prev.text} ${t}`; prev.size = Math.max(prev.size, x.size); } else joined.push({ text: t, size: x.size });
      }
      const big = joined.filter((x) => x.size >= bodySize * 1.4 && x.text.length > 2).sort((a, b) => b.size - a.size);
      const pick = big[0]?.text || joined[0]?.text || '';
      d.focus = titleCase(pick.replace(/\s*&\s*/g, ' + '));
    }
  }

  const named = days.filter((d) => d.blocks.length);
  if (!named.length) warnings.push('No encontré ejercicios con el formato "01 Nombre / 4×8–10". ¿El PDF es una imagen escaneada?');

  return {
    name: guessName(doc),
    goal: '',
    notes: guessNotes(doc),
    days: named,
    warnings,
  };
}

function guessName(doc) {
  const title = doc.meta?.Title;
  if (title && !/^untitled|^documento|\.html?$/i.test(title)) return String(title).trim();
  const p1 = doc.pages[0]?.lines.map((l) => despace(l.text)) || [];
  const r = p1.find((t) => /^rutina\b/i.test(t) && t.length < 60 && /[a-z]/.test(t));
  if (r) return r.trim();
  const file = String(doc.fileName || '').replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim();
  return file || 'Rutina importada';
}

function guessNotes(doc) {
  const p1 = (doc.pages[0]?.lines || []).map((l) => despace(l.text).trim());
  const i = p1.findIndex((t) => /^rutina\b/i.test(t));
  if (i < 0) return '';
  const out = [];
  for (const t of p1.slice(i + 1)) {
    const c = compact(t);
    if (/^PERSONALTRAINING|^BUILDSHAPE|^\d+DIAS|^DIAS/.test(c)) break;
    if (t.length > 3 && !isGroupLabel(t)) out.push(t);
  }
  return out.join(' ').replace(/\s+/g, ' ').slice(0, 500);
}
