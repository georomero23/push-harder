// Hoja "Exportar PDF": color del alumno, miniaturas, QR, y compartir/descargar.
import { html, useState, useEffect } from '../lib/deps.js';
import { store, useStore, toast, friendlyError, committed } from '../lib/store.js';
import { useExerciseIndex } from '../lib/hooks.js';
import { exportRoutinePdf, deliverPdf, isLocalHost } from '../pdf/export.js';
import { Icon, Sheet } from '../lib/ui.js';

export const ACCENTS = [
  ['#572364', 'Mora en leche'], ['#10B981', 'Esmeralda'], ['#F97316', 'Naranja'], ['#C2643C', 'Terracota'],
  ['#DB2777', 'Magenta'], ['#3B82F6', 'Azul'], ['#A855F7', 'Morado neón'], ['#EAB308', 'Oro'],
];

const canShareFiles = () => {
  try { return !!navigator.canShare?.({ files: [new File([''], 'x.pdf', { type: 'application/pdf' })] }); } catch { return false; }
};

function Toggle({ on, onChange, title, sub }) {
  return html`<button type="button" class=${`toggle-row ${on ? 'on' : ''}`} role="switch" aria-checked=${on} onClick=${() => onChange(!on)}>
    <span class="grow"><b>${title}</b>${sub && html`<small>${sub}</small>`}</span>
    <span class="switch"><i></i></span>
  </button>`;
}

export function ExportSheet({ open, onClose, routine, sid, studentName, canSave }) {
  const exIndex = useExerciseIndex();
  const base = useStore((s) => s.catalog);
  const custom = useStore((s) => s.custom);
  const [accent, setAccent] = useState(routine?.pdfAccent || ACCENTS[0][0]);
  const [withThumbs, setThumbs] = useState(true);
  const [withQr, setQr] = useState(true);
  const [step, setStep] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => { if (open) { setAccent(routine?.pdfAccent || ACCENTS[0][0]); setResult(null); setStep(''); } }, [open, routine?.id]);
  if (!open || !routine) return null;

  async function generate() {
    setBusy(true); setResult(null);
    try {
      if (canSave && accent !== routine.pdfAccent) {
        committed(store.get().fb.setRoutineAccent(sid, routine.id, accent)).catch(() => {});
      }
      const r = await exportRoutinePdf({
        routine, studentName, exIndex, catalog: [...(base || []), ...custom], accent, withThumbs, withQr, onStep: setStep,
      });
      setResult(r);
      setStep('');
    } catch (e) {
      console.error(e);
      toast(friendlyError(e), 'bad');
      setStep('');
    } finally {
      setBusy(false);
    }
  }
  async function deliver(mode) {
    const how = await deliverPdf(result, mode);
    if (how === 'downloaded') toast('PDF descargado');
  }

  const mb = result ? (result.blob.size / 1048576).toFixed(1) : null;
  return html`<${Sheet} open=${true} onClose=${onClose} title="Exportar PDF">
    <p class="muted" style="margin-top:-8px">${routine.name} · ${studentName || ''} · formato Historia 9:16</p>
    <div class="field"><span>Color del alumno</span>
      <div class="swatches">
        ${ACCENTS.map(([c, name]) => html`<button type="button" class=${`swatch ${accent.toLowerCase() === c.toLowerCase() ? 'on' : ''}`} style=${`--c:${c}`} aria-label=${name} title=${name} onClick=${() => setAccent(c)}></button>`)}
        <label class="swatch custom" title="Otro color" style=${`--c:${accent}`}>
          <input type="color" value=${accent} onInput=${(e) => setAccent(e.target.value)} aria-label="Otro color" />
        </label>
      </div>
      <p class="hint">${canSave ? 'Se guarda en la rutina para los siguientes PDFs de este alumno.' : 'El color lo elige tu entrenador; puedes probar otro para este PDF.'}</p>
    </div>
    <div class="stack">
      <${Toggle} on=${withThumbs} onChange=${setThumbs} title="Miniatura de cada ejercicio" sub="Un cuadro fijo de la animación" />
      <${Toggle} on=${withQr} onChange=${setQr} title="QR a la animación" sub="Abre la ficha del ejercicio sin iniciar sesión" />
    </div>
    ${withQr && isLocalHost() && html`<div class="banner mt"><${Icon} name="alert" />Estás en tu compu (localhost): los QR apuntarán aquí. Para los alumnos, exporta desde tu página de GitHub Pages.</div>`}
    ${result ? html`<div class="ok-box mt">Listo: ${result.fileName} · ${mb} MB</div>
      <div class=${canShareFiles() ? 'two' : ''}>
        ${canShareFiles() && html`<button class="btn btn-primary" onClick=${() => deliver('share')}><${Icon} name="mail" />Compartir</button>`}
        <button class=${`btn ${canShareFiles() ? '' : 'btn-primary btn-block'}`} onClick=${() => deliver('download')}><${Icon} name="download" />Descargar</button>
      </div>
      <button class="btn btn-ghost btn-block mt" onClick=${generate} disabled=${busy}>Generar de nuevo</button>` : html`
      <button class="btn btn-primary btn-block mt" disabled=${busy} onClick=${generate}>${busy ? step || 'Generando…' : 'Generar PDF'}</button>`}
  <//>`;
}
