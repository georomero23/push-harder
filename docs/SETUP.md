# Guía de configuración: Firebase + GitHub Pages

Todo es gratis: Firebase en plan **Spark** y GitHub Pages en un repo público. Toma unos 20 minutos.

> **Regla de oro:** nunca cambies el proyecto a plan Blaze ni le ligues tarjeta. En Spark, si algún día se acaba la cuota del día, Firebase deja de responder hasta el día siguiente; **nunca cobra**.

---

## 1. Crear el proyecto de Firebase

1. Entra a <https://console.firebase.google.com> → **Agregar proyecto**.
2. Nombre: `push-harder` (o el que quieras).
3. **Desactiva Google Analytics** (la app no lo usa).
4. Crea el proyecto. Queda en plan Spark por defecto.

## 2. Registrar la app web y copiar la configuración

1. En la página del proyecto, da clic en el ícono **`</>`** (Web).
2. Apodo: `push-harder-web`. **No** marques Firebase Hosting.
3. Firebase te muestra un bloque `firebaseConfig`. Copia estos 4 valores a `js/config.js`:

```js
export const firebaseConfig = {
  apiKey: 'AIza…',
  authDomain: 'push-harder-xxxx.firebaseapp.com',
  projectId: 'push-harder-xxxx',
  appId: '1:…:web:…',
};
```

Estos valores **no son secretos** (Google los diseñó para ir en el navegador). Lo que protege los datos son las reglas del paso 4 y la restricción del paso 6.

## 3. Activar el login con correo y contraseña

1. **Authentication → Comenzar → Método de acceso → Correo electrónico/contraseña → Habilitar** (solo el primer interruptor, no el de "vínculo por correo").
2. **Authentication → Plantillas → Restablecimiento de contraseña**:
   - Idioma de las plantillas: **Español**.
   - Nombre del remitente: `PUSH HARDER`.
   Este es el correo que les llega a tus alumnos para crear su contraseña.
3. **Authentication → Configuración → Dominios autorizados → Agregar dominio**: `TUUSUARIO.github.io` (tu usuario de GitHub). `localhost` ya viene incluido.

## 4. Crear Firestore y publicar las reglas

1. **Firestore Database → Crear base de datos**.
2. Modo: **producción**.
3. Ubicación: una de Norteamérica (por ejemplo `nam5 (United States)`). **No se puede cambiar después.**
4. Pestaña **Reglas**: borra lo que haya, pega todo el contenido de `firestore.rules` y da clic en **Publicar**.

No hace falta crear índices: todas las consultas de la app usan los índices automáticos de Firestore.

## 5. Crear tu cuenta de entrenador

1. **Authentication → Usuarios → Agregar usuario**: tu correo y una contraseña.
2. Copia el **UID** que aparece en la tabla.
3. **Firestore Database → Datos → Iniciar colección**:
   - ID de colección: `users`
   - ID del documento: **pega tu UID**
   - Campos:

| Campo | Tipo | Valor |
|---|---|---|
| `role` | string | `trainer` |
| `trainerId` | string | tu mismo UID (así también puedes entrenar con la app) |
| `name` | string | `Geo Romero` |
| `email` | string | tu correo |
| `active` | boolean | `true` |

Esta es la única vez que se toca la base de datos a mano. A tus alumnos los das de alta desde la app.

## 6. Restringir la API key a tus dominios (recomendado)

1. Entra a <https://console.cloud.google.com/apis/credentials> con la misma cuenta y elige tu proyecto.
2. Abre **Browser key (auto created by Firebase)**.
3. **Restricciones de aplicaciones → Sitios web**, agrega:
   - `https://TUUSUARIO.github.io/*`
   - `https://TU-PROYECTO.firebaseapp.com/*` ← aquí vive la página de "crear contraseña" de los correos; si la omites, el enlace del correo falla
   - `http://localhost/*` y `http://localhost:*/*` (para probar en tu compu)
4. **Restricciones de API → Restringir clave**, marca solo:
   - Identity Toolkit API
   - Token Service API
   - Cloud Firestore API
5. Guarda. Los cambios tardan unos minutos. Prueba entrar a la app; si el login falla con un error de API key, revisa que estén las 3 APIs y los dominios.

## 7. Publicar en GitHub Pages

El proyecto tiene ~1,200 archivos (casi todos animaciones). La subida por la web de GitHub solo acepta 100 archivos a la vez, así que usa **git** o **GitHub Desktop**.

1. En GitHub crea un repositorio **público** llamado `push-harder` (sin README).
2. En la carpeta del proyecto:

```bash
git init
git add .
git commit -m "Fase 1: login + catálogo"
git branch -M main
git remote add origin https://github.com/TUUSUARIO/push-harder.git
git push -u origin main
```

3. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
4. En 1–2 minutos queda en `https://TUUSUARIO.github.io/push-harder/`.

Cada `git push` vuelve a publicar solo.

## 8. Probar en tu compu antes de publicar

Desde la carpeta del proyecto:

```bash
python3 -m http.server 8000
```

Abre <http://localhost:8000>. (Abrir `index.html` con doble clic no funciona: los módulos de JavaScript necesitan un servidor.)

## 9. Probar las reglas de seguridad (opcional, recomendado)

Requiere Node 20+ y Java 21+.

```bash
npm install
npm run test:rules
```

Corre el emulador de Firestore en tu compu y verifica que un alumno no pueda leer a otro, que nadie se cambie el rol, que el historial no se borre, etc. No toca tu proyecto real.

Para el motor de progresión no necesitas nada: `node --test tests/engine.test.js` corre sus pruebas sin instalar nada.

## 10. Agregar un ejercicio propio con tu animación

1. En GitHub, entra a la carpeta `media/custom/` → **Add file → Upload files** → sube tu archivo (`hip-thrust-maquina.mp4`). Prefiere MP4 o WebP, de menos de 1.5 MB.
2. Espera ~1 minuto a que Pages publique.
3. En la app: **Catálogo → +** → escribe el nombre del archivo → llena los datos → **Guardar**.

También puedes usar una URL externa en lugar de un archivo del repo.

---

## 11. Exportar la rutina a PDF

En la ficha del alumno: **Exportar PDF** → elige su color → **Generar PDF** → **Compartir** (en el celular abre WhatsApp y demás) o **Descargar**.

- El PDF es formato Historia 9:16, con texto real (seleccionable), miniatura de cada ejercicio y un QR que abre su animación.
- **Genera los PDFs para alumnos desde tu página de GitHub Pages**, no desde `localhost`: los QR apuntan a la dirección desde donde exportas.
- Lo que escribes en "Nota del entrenador" de cada día y en "Alternativa" de cada ejercicio sale en el PDF. Si dejas la alternativa vacía, la app sugiere dos variantes del mismo patrón.

## 12. Instalar la app en el celular (y usarla sin señal)

Abre `https://TUUSUARIO.github.io/push-harder/` con señal y entra con tu cuenta.

- **Android (Chrome):** en Inicio aparece **Instala PUSH HARDER → Instalar**. También funciona desde el menú ⋮ → *Instalar app*.
- **iPhone (Safari):** toca **Compartir** ⬆︎ → **Agregar a inicio**. Tiene que ser desde Safari.

Para el gym:

1. Con señal, en Inicio toca **Preparar para el gym**. Guarda las animaciones de toda tu rutina; el día que sigue se guarda solo.
2. Sin señal puedes abrir la app, ver tu rutina y entrenar: series, descansos, molestias y el cierre de la sesión se guardan en el teléfono.
3. Al volver la señal aparece **"Conexión de vuelta: sincronizando…"** y luego **"Todo sincronizado"**.

Notas:

- La primera vez necesitas señal para entrar con tu correo. Después la sesión queda guardada.
- Lo que no se ha visto nunca (una ficha nueva del catálogo, alguien más dando de alta un alumno) necesita señal.
- En iPhone, si no abres la app por varias semanas, iOS puede borrar lo guardado; vuelve a tocar *Preparar para el gym*.

## 13. Publicar una versión nueva

Cada vez que cambies archivos de la app:

```bash
python3 tools/build-sw.py
git add . && git commit -m "Cambios" && git push
```

`build-sw.py` actualiza la versión del modo sin señal. Así los celulares con la app instalada muestran **Nueva versión lista · Actualizar** y nadie se queda con archivos viejos.

## Límites del plan gratis (para tu tranquilidad)

| Recurso | Cuota diaria Spark | Uso estimado con 20 alumnos |
|---|---|---|
| Lecturas Firestore | 50,000 | < 2,000 |
| Escrituras Firestore | 20,000 | < 700 |
| Almacenamiento | 1 GiB | < 50 MB en un año |
| GitHub Pages | ~100 GB/mes de transferencia | < 5 GB/mes |

Las animaciones y el catálogo se sirven desde GitHub Pages, no desde Firebase, así que no gastan cuota.
