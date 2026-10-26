# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Tetris en JavaScript vanilla + HTML5 Canvas. Sin dependencias, sin `package.json`, sin build y sin linter. El README, la UI y los textos están en español: mantén ese idioma.

## Ejecutar

- Abrir `index.html` directamente (`start index.html` en Windows), o
- Servidor estático (recomendado): `python -m http.server 8000` → http://localhost:8000

## Verificación

- IMPORTANTE: ejecuta `node --test` (sin argumentos; descubre `tests/*.test.mjs`) antes de dar un cambio por terminado. También corre en CI (`.github/workflows/tests.yml`).
- `tests/game.test.mjs` carga `game.js` en un contexto `vm` con stubs de DOM/canvas y accede a las globales con `run('expresión')`. Si cambias lógica o un acoplamiento, añade o ajusta su test.
- Los tests no cubren lo visual: si el cambio afecta a la UI, comprueba en el navegador y aporta una captura.

## Repositorio

- `origin` es el fork `vjtalavera/claude-tetris-vj`: issues y PRs van ahí. `gh` puede resolver por defecto a `upstream` (`DevTalles-corp/claude-tetris`, solo lectura), así que pasa `-R` explícito.
- Commits y PRs en español con prefijo (`feat:`, `fix:`, `docs:`, `ci:`); el PR cierra su issue con `Closes #N`.
- Flujo: issue → triaje automático (`claude-issue-triage.yml`, comentario con diagnóstico) → implementación con `@claude` en el issue o `/fix-issue N` en local.

## Arquitectura (game.js)

- Script clásico (no módulo ES), cargado al final de `<body>`; obtiene los elementos DOM por `id` al cargar y llama a `init()` y después a `showStart()` (pantalla de inicio: cancela el rAF y pone `started = false`; `init()` lo vuelve a `true`, y el `keydown` no hace nada mientras sea `false`). Si renombras ids en `index.html`, actualiza las constantes del principio de `game.js`.
- Todo el estado es global y mutable (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropAccum`, `dropInterval`, `animId`, `combo`, `maxCombo`, `started`…). `init()` lo reinicia todo y es también el handler del botón Jugar/Reiniciar (`#restart-btn`).
- El número de cada celda es a la vez el tipo de pieza y el índice en `COLORS`: `PIECES[t]` usa el valor `t` en sus celdas, `merge()` copia esos valores al `board` y `drawBlock()` los resuelve contra `COLORS`. Añadir una pieza implica tocar `PIECES`, `COLORS`, `COLORS_LIGHT` (paleta del modo claro, mismos índices) y el `* 7` de `randomPiece()`.
- `collide(shape, x, y)` es la única comprobación de colisión; la usan movimiento, rotación (`tryRotate` con kicks `[0,-1,1,-2,2]`), caída, ghost (`ghostY`) y detección de game over en `spawn()`.
- Bucle: `requestAnimationFrame(loop)` acumula `dt` en `dropAccum` y baja una fila al superar `dropInterval`. Pausa y game over cancelan el frame con `cancelAnimationFrame(animId)`; reanudar llama a `loop()` directamente.
- Ciclo de fijado: `lockPiece()` → `merge()` → `clearLines()` (actualiza `combo`/`maxCombo`: +1 si limpia, 0 si no; recalcula `level = gameStartLevel + floor(lines/10)` y `dropInterval = dropIntervalFor(level)`, es decir `max(100, 1000 - (level-1)*90)`) → `holdUsed = false` → `spawn()` (mueve `next` a `current`, genera `next`, redibuja la vista previa) → `drawHold()`.
- Nivel inicial: `startLevel` (1–`MAX_START_LEVEL`) se lee de `localStorage` (`tetris-start-level`, inválido → 1) y lo cambia el `<select id="start-level">`; solo `init()` lo copia a `gameStartLevel` (el que usa `clearLines()`), así que no altera la partida en curso. Las opciones del select deben ir de 1 a `MAX_START_LEVEL`.
- Hold: `held` guarda solo el tipo (la pieza vuelve sin rotar vía `makePiece(type)`) y `holdUsed` lo bloquea hasta el siguiente fijado. `holdPiece()` también llama a `spawn()` en el primer hold, por eso el desbloqueo vive en `lockPiece()` y no en `spawn()`.
- El overlay (`#overlay`) se reutiliza para INICIO, PAUSA y GAME OVER vía `showOverlay(title, text, mode)` (`'start'`, `'pause'`, `'gameover'`) / `hideOverlay()`; los bloques internos se ocultan con el atributo `hidden`. En pausa muestra `#pause-menu` (Reanudar, Reiniciar, Ver controles, Nivel inicial); en inicio y game over, `#records` y `#restart-btn` («Jugar» o «Reiniciar»). `hideOverlay()` hace `blur()` del elemento con foco para que Space/Enter/flechas no reactiven el menú.
- Pantalla de inicio: al cargar se ejecuta `init()` (los tests lo asumen) y después `showStart()`, que para el bucle y pone `started = false`; el botón Jugar llama a `init()`.
- Teclado: el `keydown` ignora todo si `!started` o si el `target` es un `INPUT`. `P`/`Escape` alternan la pausa (sus repeticiones se ignoran; en game over no hacen nada). Con el menú abierto ignora el resto de teclas. `hideOverlay()` (al reanudar y en `init()`) vacía `freshKeys`; las repeticiones (`e.repeat`) de teclas que no se hayan vuelto a pulsar desde entonces se ignoran, así una tecla mantenida desde antes no mueve la pieza al volver.
- Récords: `records` (`{ top, bestCombo, maxLines }`) se carga con `loadRecords()` desde `localStorage['tetris-records']` (JSON inválido → vacío; las entradas inválidas se descartan una a una). `endGame()` persiste siempre `bestCombo`/`maxLines` y, si `qualifies(score)`, muestra `#record-new` y `#record-form`; `saveRecord()` → `addRecord()` inserta, recorta a 5 y deja la fila en `highlight`. Los nombres se pintan con `textContent`.

## Acoplamientos a tener en cuenta

- Tamaño del canvas `#board` en `index.html` debe ser `COLS*BLOCK × ROWS*BLOCK` (300×600 por defecto).
- `drawPreview()` (usado por `drawNext()` y `drawHold()`) asume una rejilla 4×4 de 30 px → `#next-canvas` y `#hold-canvas` son 120×120.
- Los controles están documentados en tres sitios: el `keydown` de `game.js`, la lista `#controls-list` de `index.html` (el menú de pausa copia su contenido en `#pause-controls` al cargar) y la tabla del README. Mantenlos sincronizados.
