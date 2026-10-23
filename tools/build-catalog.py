#!/usr/bin/env python3
"""
Genera el catálogo base de la app a partir de free-exercise-db (dominio público, Unlicense).

Entrada:  tools/catalog-es.json   (curaduría en español: nombre MX, patrón, indicaciones…)
Salida:   data/catalog.json        (lo que carga la app)
          media/ex/<id>/0.webp     cuadro 1 (600 px)
          media/ex/<id>/1.webp     cuadro 2 (600 px)
          media/ex/<id>/t0.webp    miniatura cuadro 1 (240 px) para listas
          media/ex/<id>/t1.webp    miniatura cuadro 2 (240 px)

Uso:
    pip install pillow
    python3 tools/build-catalog.py            # descarga solo lo que falte
    python3 tools/build-catalog.py --force    # vuelve a generar todas las imágenes

Para agregar/quitar ejercicios base: edita tools/catalog-es.json (campo srcId = id en
free-exercise-db) y vuelve a correr el script. Los ejercicios propios NO van aquí:
se capturan desde la app (colección `exercises` en Firestore + archivo en media/custom/).
"""
import io
import json
import re
import ssl
import sys
import os
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC_JSON = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json"
SRC_IMG = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/"
FRAME_W, THUMB_W = 600, 240
FRAME_Q, THUMB_Q = 72, 65

_ctx = ssl.create_default_context()
if os.environ.get("SSL_CERT_FILE"):
    _ctx.load_verify_locations(os.environ["SSL_CERT_FILE"])


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=60, context=_ctx) as r:
        return r.read()


def slug(src_id: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", src_id.lower()).strip("-")


def to_webp(raw: bytes, width: int, quality: int) -> bytes:
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    h = round(im.height * width / im.width)
    im = im.resize((width, h), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=quality, method=6)
    return buf.getvalue()


def build_media(item, force: bool):
    out = ROOT / "media" / "ex" / item["id"]
    out.mkdir(parents=True, exist_ok=True)
    frames = item["_images"][:2]
    targets = [out / f"{i}.webp" for i in range(len(frames))]
    targets += [out / f"t{i}.webp" for i in range(len(frames))]
    if not force and all(t.exists() for t in targets):
        return item["id"], "skip"
    for i, rel in enumerate(frames):
        raw = fetch(SRC_IMG + rel)
        (out / f"{i}.webp").write_bytes(to_webp(raw, FRAME_W, FRAME_Q))
        (out / f"t{i}.webp").write_bytes(to_webp(raw, THUMB_W, THUMB_Q))
    return item["id"], "ok"


def main():
    force = "--force" in sys.argv
    curated = json.loads((ROOT / "tools" / "catalog-es.json").read_text("utf-8"))
    dataset = {x["id"]: x for x in json.loads(fetch(SRC_JSON))}

    items = []
    for c in curated["exercises"]:
        src = dataset.get(c["srcId"])
        if not src or not src.get("images"):
            print(f"  ! sin datos/imágenes en el dataset: {c['srcId']}")
            continue
        item = {
            "id": slug(c["srcId"]),
            "nameEs": c["nameEs"],
            "aliases": c.get("aliases", []),
            "pattern": c["pattern"],
            "region": c["region"],
            "equipment": c["equipment"],
            "mechanic": c["mechanic"],
            "level": c.get("level") or src.get("level"),
            "primary": c["primary"],
            "secondary": c.get("secondary", []),
            "cues": c["cues"],
            "frames": min(2, len(src["images"])),
            "srcId": c["srcId"],
            "_images": src["images"],
        }
        items.append(item)

    with ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(lambda it: build_media(it, force), items))
    done = sum(1 for _, r in results if r == "ok")
    print(f"Imágenes: {done} generadas, {len(results) - done} ya existían")

    items.sort(key=lambda x: x["nameEs"].lower())
    for it in items:
        it.pop("_images")
    catalog = {
        "version": date.today().isoformat(),
        "source": "free-exercise-db (Unlicense) · curado para PUSH HARDER",
        "count": len(items),
        "exercises": items,
    }
    (ROOT / "data" / "catalog.json").write_text(
        json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), "utf-8"
    )
    print(f"data/catalog.json: {len(items)} ejercicios")


if __name__ == "__main__":
    main()
