# PUSH HARDER · App de entrenamiento

PWA de rutinas para entrenador y alumnos: catálogo con animaciones, rutinas, modo entrenamiento, motor de progresión con aprobación y exportación a PDF.

- **Sin servidor propio y gratis:** HTML/CSS/JS estático en GitHub Pages + Firebase Auth y Firestore (plan Spark). Nada se pausa ni se duerme.
- **Sin señal:** se instala en el celular; la app, el catálogo y las animaciones quedan guardados (service worker) y Firestore guarda y sincroniza solo lo que registras.
- **Seguridad:** las reglas de `firestore.rules` aíslan a cada alumno. La config web de Firebase en `js/config.js` es pública por diseño.

Configuración y publicación paso a paso: **[docs/SETUP.md](docs/SETUP.md)**.

## Estructura

```
index.html              entrada
manifest.webmanifest    datos para instalar la app (nombre, íconos, colores)
sw.js                   service worker: modo sin señal y actualizaciones
css/app.css             estilos (tema oscuro, acento mora en leche #572364)
js/app.js               arranque, rutas y barra inferior
js/config.js            TU configuración pública de Firebase (el único archivo que editas)
js/version.js           nombre y versión de la app
js/firebase.js          Auth + Firestore (se carga diferido)
js/lib/                 catálogo, rutinas, sesiones, estado, router, componentes
js/engine/              motor de progresión puro (reglas R1–R6, guardia, incrementos) · ver js/engine/README.md
js/views/               pantallas (editor de rutinas, modo entrenamiento, fichas…)
js/pdf/                 PDF Historia 9:16: layout.js (puro), export.js (navegador), metrics.js
data/catalog.json       297 ejercicios base (generado)
media/ex/<id>/          2 cuadros WebP + miniaturas por ejercicio (generado)
media/custom/           animaciones de tus ejercicios propios
tools/catalog-es.json   curaduría en español (nombres MX, patrón, indicaciones)
tools/build-catalog.py  regenera data/ y media/ex/ desde free-exercise-db
tools/build-sw.py       actualiza la lista y versión del service worker (córrelo antes de publicar cambios)
firestore.rules         reglas de seguridad
tests/rules.test.js     pruebas de reglas (emulador: npm run test:rules)
tests/engine.test.js    pruebas del motor (sin instalar nada: node --test tests/engine.test.js)
```

## Publicar cambios

1. `python3 tools/build-sw.py` (si cambiaste archivos de la app).
2. `git add . && git commit -m "…" && git push`.
3. Los celulares con la app instalada verán **Nueva versión lista · Actualizar**.

## Fases

1. ✅ Login + catálogo con animaciones
2. ✅ Rutinas y modo entrenamiento
3. ✅ Registro y motor de progresión
4. ✅ Exportar a PDF (formato Historia 9:16)
5. ✅ PWA instalable y sin señal

## Créditos

- Ejercicios e imágenes: [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (dominio público, Unlicense). Nombres, patrones e indicaciones en español curados para esta app.
- Tipografía: Archivo, Archivo Black y Big Shoulders Display (SIL Open Font License, ver `fonts/OFL.txt` y `fonts/pdf/`).
- PDF: pdfmake (MIT) por CDN, se descarga solo al exportar.
- UI: Preact + htm (MIT) por CDN.
