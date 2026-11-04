// Convierte el texto de pdf.js (items con posición) en renglones legibles, página por página.
// Puro: no depende de pdf.js ni del DOM (se prueba en Node).

/**
 * @param {{items: {str:string, transform:number[], width:number, height:number}[]}} content
 * @param {number} page
 * @returns {{page:number, y:number, size:number, text:string, cells:{x:number, w:number, text:string, size:number}[]}[]}
 */
export function toLines(content, page = 1) {
  const items = (content.items || [])
    .filter((it) => it.str != null && it.str !== '')
    .map((it) => {
      const [a, b, , d, x, y] = it.transform;
      const size = Math.hypot(a, b) || Math.abs(d) || it.height || 10;
      return { x, y, w: it.width || 0, size, str: it.str };
    })
    .sort((p, q) => q.y - p.y || p.x - q.x);

  const lines = [];
  for (const it of items) {
    const blank = it.str.trim() === '';
    const tol = Math.max(2, it.size * 0.45);
    let line = lines.find((l) => Math.abs(l.y - it.y) <= tol);
    if (!line) { if (blank) continue; line = { page, y: it.y, items: [] }; lines.push(line); }
    line.items.push(it);
  }
  lines.sort((p, q) => q.y - p.y);

  return lines.map((l) => {
    const its = l.items.sort((p, q) => p.x - q.x);
    // Celdas: grupos de items separados por huecos grandes (columnas).
    const cells = [];
    for (const it of its) {
      const prev = cells[cells.length - 1];
      const gap = prev ? it.x - (prev.x + prev.w) : Infinity;
      const unit = prev ? Math.min(prev.size, it.size) : it.size;
      if (prev && gap < unit * 1.6) {
        const sep = gap > unit * 0.15 && !prev.text.endsWith(' ') && !it.str.startsWith(' ') ? ' ' : '';
        prev.text += sep + it.str;
        prev.w = Math.max(prev.w, it.x + it.w - prev.x);
        prev.size = Math.max(prev.size, it.size);
      } else if (it.str.trim() === '') {
        continue;
      } else {
        cells.push({ x: it.x, w: it.w, text: it.str, size: it.size });
      }
    }
    for (const c of cells) c.text = c.text.replace(/\s+/g, ' ').trim();
    const real = its.filter((i) => i.str.trim() !== '');
    return {
      page,
      y: l.y,
      size: Math.max(...real.map((i) => i.size)),
      text: cells.map((c) => c.text).join('  '),
      cells,
    };
  });
}
