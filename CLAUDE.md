# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Tetris en JavaScript vanilla + HTML5 Canvas. Sin dependencias, sin `package.json`, sin build, sin linter y sin tests. El README, la UI y los textos están en español: mantén ese idioma.

## Ejecutar

- Abrir `index.html` directamente (`start index.html` en Windows), o
- Servidor estático (recomendado): `python -m http.server 8000` → http://localhost:8000

No hay suite de tests: la verificación es manual en el navegador.

## Arquitectura (game.js)

- Script clásico (no módulo ES), cargado al final de `<body>`; obtiene los elementos DOM por `id` al cargar y llama a `init()` de inmediato. Si renombras ids en `index.html`, actualiza las constantes del principio de `game.js`.
- Todo el estado es global y mutable (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropAccum`, `dropInterval`, `animId`…). `init()` lo reinicia todo y es también el handler del botón Reiniciar.
- El número de cada celda es a la vez el tipo de pieza y el índice en `COLORS`: `PIECES[t]` usa el valor `t` en sus celdas, `merge()` copia esos valores al `board` y `drawBlock()` los resuelve contra `COLORS`. Añadir una pieza implica tocar `PIECES`, `COLORS` y el `* 7` de `randomPiece()`.
- `collide(shape, x, y)` es la única comprobación de colisión; la usan movimiento, rotación (`tryRotate` con kicks `[0,-1,1,-2,2]`), caída, ghost (`ghostY`) y detección de game over en `spawn()`.
- Bucle: `requestAnimationFrame(loop)` acumula `dt` en `dropAccum` y baja una fila al superar `dropInterval`. Pausa y game over cancelan el frame con `cancelAnimationFrame(animId)`; reanudar llama a `loop()` directamente.
- Ciclo de fijado: `lockPiece()` → `merge()` → `clearLines()` (recalcula `level` y `dropInterval = max(100, 1000 - (level-1)*90)`) → `spawn()` (mueve `next` a `current`, genera `next`, redibuja la vista previa).
- El overlay (`#overlay`) se reutiliza para PAUSA y GAME OVER cambiando `#overlay-title`/`#overlay-score` y la clase `hidden`.

## Acoplamientos a tener en cuenta

- Tamaño del canvas `#board` en `index.html` debe ser `COLS*BLOCK × ROWS*BLOCK` (300×600 por defecto).
- `drawNext()` asume una rejilla 4×4 de 30 px → `#next-canvas` es 120×120.
- Los controles están documentados en tres sitios: el `keydown` de `game.js`, la lista `.controls` de `index.html` y la tabla del README. Mantenlos sincronizados.
