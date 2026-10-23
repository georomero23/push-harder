# Motor de progresión

Módulo puro: no usa Firebase ni el DOM, así que se prueba con `node --test tests/engine.test.js` sin instalar nada.

| Archivo | Qué hace |
|---|---|
| `progression.js` | Reglas R1–R5, meta de sesión (R2), variantes, sustitutos y descarga |
| `volume.js` | R6: series efectivas por grupo muscular |
| `guard.js` | "Intensidad ≠ volumen": rechaza propuestas que agreguen series o ejercicios |
| `increments.js` | Incremento de carga por región/equipo (o el que fijes en el slot) |

## Flujo

1. Al terminar una sesión, la app actualiza `progress.recent` (últimas 3 actuaciones por ejercicio).
2. Por cada ejercicio llama a `evaluateSlot({ slot, exercise, history, currentLoadKg, flagged, catalog })`.
3. Cada propuesta pasa por `guard()`, se descarta si ya se decidió con la misma evidencia (`alreadyDecided`) y se guarda en `users/{alumno}/proposals` como `pending`.
4. **Nada cambia hasta que alguien la acepta.** Carga/reps (`scope: 'load'`): la acepta el alumno o el entrenador. Variante, sustituto o descarga (`scope: 'structure'`): solo el entrenador.
5. Al aceptar o rechazar se escribe una entrada en `users/{alumno}/changes`.

## Forma de una propuesta

```js
{
  rule: 'R1',                 // R1 | R3 | R4 | R5
  kind: 'load_up',            // load_up | load_down | plateau | substitute
  scope: 'load',              // load | structure
  slotId, exId,
  from: { loadKg: 60, repTarget: null },
  to:   { loadKg: 62.5, repTarget: 8 },
  options: [{ type: 'variant', exId, exName }, { type: 'deload' }],   // solo structure
  reason: 'Hiciste 12/12/12 con RIR 2·2·1 → +2.5 kg (60 → 62.5) y vuelves a 8 reps.',
  evidence: { sessionIds: [...], perf: [...] },
  engineVersion: '1.0.0',
}
```

## Conectar una IA más adelante

Escribe un módulo con la misma firma que `evaluateSlot` (recibe el mismo contexto y devuelve propuestas con la misma forma). Pásalas por `guard()` igual que las del motor. Así la IA tampoco puede agregar series ni ejercicios, y todo sigue requiriendo aprobación.

Una API de IA no se puede llamar directo desde el navegador sin exponer su llave: va a hacer falta un proxy mínimo (por ejemplo, Cloudflare Workers en su plan gratis). Eso se decide cuando toque.
