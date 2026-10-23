#!/usr/bin/env python3
"""
Actualiza la lista de archivos que el service worker (sw.js) guarda para el modo sin señal,
y su versión (un hash del contenido). Córrelo cada vez que agregues o cambies archivos de la app:

    python3 tools/build-sw.py

Si la versión cambia, la app de tus alumnos muestra "Nueva versión lista · Actualizar".
No incluye media/ (las animaciones se guardan al verse o con "Preparar para el gym"),
ni fonts/pdf/ (se guardan la primera vez que exportas un PDF).
"""
import hashlib
import json
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INCLUDE = ['index.html', 'manifest.webmanifest', 'css/**/*.css', 'js/**/*.js', 'data/catalog.json', 'fonts/*.woff2', 'icons/*']


def main():
    files = sorted({p for pat in INCLUDE for p in ROOT.glob(pat) if p.is_file()})
    digest = hashlib.sha256()
    for p in files:
        digest.update(p.relative_to(ROOT).as_posix().encode())
        digest.update(p.read_bytes())
    version = f"ph-{date.today():%Y%m%d}-{digest.hexdigest()[:8]}"
    assets = [p.relative_to(ROOT).as_posix() for p in files]

    sw = ROOT / 'sw.js'
    src = sw.read_text('utf-8')
    src = re.sub(r"// @@VERSION\n.*?// @@END-VERSION", f"// @@VERSION\nconst VERSION = '{version}';\n// @@END-VERSION", src, flags=re.S)
    listing = ',\n'.join(f"  {json.dumps(a)}" for a in assets)
    src = re.sub(r"// @@ASSETS\n.*?// @@END-ASSETS", f"// @@ASSETS\nconst ASSETS = [\n{listing},\n];\n// @@END-ASSETS", src, flags=re.S)
    sw.write_text(src, 'utf-8')
    size = sum(p.stat().st_size for p in files)
    print(f"sw.js → versión {version} · {len(assets)} archivos · {size / 1024:.0f} KB")


if __name__ == '__main__':
    main()
