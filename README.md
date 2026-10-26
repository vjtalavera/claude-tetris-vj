# Tetris

Implementación del clásico **Tetris** en JavaScript vanilla, usando HTML5 Canvas y CSS. Sin dependencias externas, sin frameworks, sin proceso de build: solo abrir y jugar.

**▶ [Jugar online](https://vjtalavera.github.io/claude-tetris-vj/)**

![Tech](https://img.shields.io/badge/HTML5-Canvas-orange)
![Tech](https://img.shields.io/badge/CSS3-blueviolet)
![Tech](https://img.shields.io/badge/JavaScript-Vanilla-yellow)

---

## Tabla de contenidos

- [Tetris](#tetris)
  - [Tabla de contenidos](#tabla-de-contenidos)
  - [Qué hace el proyecto](#qué-hace-el-proyecto)
  - [Cómo ejecutar el juego](#cómo-ejecutar-el-juego)
    - [Opción 1: abrir el archivo directamente](#opción-1-abrir-el-archivo-directamente)
    - [Opción 2: servidor local (recomendado)](#opción-2-servidor-local-recomendado)
    - [Tests](#tests)
  - [Controles](#controles)
  - [Cómo se juega](#cómo-se-juega)
  - [Cómo funciona](#cómo-funciona)
    - [1. `index.html`](#1-indexhtml)
    - [2. `style.css`](#2-stylecss)
    - [3. `game.js`](#3-gamejs)
    - [Flujo del juego](#flujo-del-juego)
  - [Tecnologías](#tecnologías)
  - [Estructura del proyecto](#estructura-del-proyecto)
  - [Personalización](#personalización)
  - [Licencia](#licencia)

---

## Qué hace el proyecto

Es una versión jugable del Tetris clásico con todas las mecánicas que esperarías:

- Tablero de **10 × 20** celdas.
- Las **7 piezas estándar** (I, O, T, S, Z, J, L) con colores diferenciados.
- **Rotación** con _wall kicks_ básicos (pequeños desplazamientos para que la pieza pueda rotar pegada a la pared).
- **Soft drop** (bajada acelerada) y **hard drop** (caída instantánea).
- **Pieza fantasma** (_ghost piece_): muestra dónde aterrizará la pieza actual.
- **Vista previa** de la siguiente pieza.
- **Sistema de puntuación** clásico de Tetris (100 / 300 / 500 / 800 multiplicado por nivel).
- **Niveles** que aumentan cada 10 líneas y aceleran la caída, con **nivel inicial** configurable (1–10) desde el menú de pausa.
- **Modo oscuro / claro**: el juego arranca en oscuro y el botón de la esquina superior derecha («Modo claro» / «Modo oscuro») cambia el tema. La elección se guarda en `localStorage`.
- **Menú de pausa** (`P` o `Escape`) con **Reanudar**, **Reiniciar**, **Ver controles** y selector de **Nivel inicial**. Mientras está abierto el juego ignora el teclado, y al reanudar no cuentan las teclas que siguieran pulsadas desde antes.
- **Game Over** con opción de reinicio.
- **Tabla de récords local**: top 5 de puntuaciones con nombre, mejor combo y líneas máximas, guardados en `localStorage` y visibles en la pantalla de inicio y en el Game Over.

---

## Cómo ejecutar el juego

No hay nada que instalar ni compilar. Tienes dos opciones:

### Opción 1: abrir el archivo directamente

```bash
open index.html        # macOS
xdg-open index.html    # Linux
start index.html       # Windows
```

### Opción 2: servidor local (recomendado)

Cualquier servidor estático funciona. Algunos ejemplos:

```bash
# Con Python 3
python3 -m http.server 8000

# Con Node.js (npx)
npx serve .

# Con PHP
php -S localhost:8000
```

Después abre `http://localhost:8000` en el navegador.

### Tests

Sin dependencias, con el runner integrado de Node.js:

```bash
node --test
```

---

## Controles

| Tecla         | Acción                                                      |
| ------------- | ----------------------------------------------------------- |
| `←` / `→`     | Mover la pieza horizontalmente                              |
| `↑` o `X`     | Rotar la pieza en sentido horario                           |
| `↓`           | Soft drop (bajar más rápido)                                |
| `Espacio`     | Hard drop (caída instantánea)                               |
| `C` o `Shift` | Hold: reservar o intercambiar la pieza (una vez por pieza)  |
| `P` o `Esc`   | Abrir / cerrar el menú de pausa                             |

---

## Cómo se juega

- **Completa líneas para sumar puntos.** Cuando una fila queda llena de bloques, se elimina y ganas puntos (100 / 300 / 500 / 800 según elimines 1, 2, 3 o 4 líneas a la vez, multiplicado por el nivel). Cada 10 líneas subes de nivel y la caída se acelera.
- **Empezar.** Al abrir el juego aparece la pantalla de inicio con la tabla de récords; pulsa **Jugar** para comenzar.
- **Combos.** El combo cuenta cuántas piezas seguidas has fijado limpiando al menos una línea cada una: cada una suma 1 y una pieza que no limpia lo devuelve a 0. El mejor combo se guarda como récord.
- **Cuándo termina la partida.** El juego acaba (**Game Over**) cuando una pieza nueva no cabe al aparecer en la parte superior del tablero porque los bloques apilados llegan hasta arriba. Se muestra tu puntuación final y la tabla de récords.
- **Menú de pausa.** Con `P` o `Escape` se abre el menú: **Reanudar** vuelve a la partida, **Reiniciar** empieza una nueva sin recargar la página, **Ver controles** despliega la lista de teclas y **Nivel inicial** elige con qué nivel empieza la próxima partida (se guarda en `localStorage`; no altera la partida en curso).
- **Récords.** Si tu puntuación entra en el top 5 verás «¡Nuevo récord!» y un campo para escribir tu nombre (máx. 12 caracteres); pulsa **Guardar** o `Enter` y tu fila quedará resaltada. El mejor combo y las líneas máximas se guardan siempre. El botón **Borrar récords** (con confirmación) vacía la tabla.
- **Reiniciar tras el Game Over.** El overlay de Game Over muestra la puntuación final, los récords y el botón **Reiniciar** (el mismo que en la pantalla de inicio se llama **Jugar**).

---

## Cómo funciona

El juego se compone de tres archivos que cooperan:

### 1. `index.html`

Define la estructura visual:

- Un `<canvas id="board">` de **300 × 600** píxeles donde se renderiza el tablero.
- Un panel izquierdo con el slot `HOLD` (pieza reservada).
- Un panel derecho con `SCORE`, `LINES`, `LEVEL`, vista de la siguiente pieza y la lista de controles.
- Un overlay para la **pantalla de inicio** y los estados **PAUSA** (con el menú de pausa) y **GAME OVER** (con la tabla de récords y el formulario de nombre).

### 2. `style.css`

Aporta el aspecto visual con estética _dark / retro arcade_: fondo oscuro, tipografía monoespaciada para los marcadores y _backdrop blur_ en los overlays.

### 3. `game.js`

Contiene toda la lógica del juego. A grandes rasgos:

- **Modelo del tablero**: una matriz `ROWS × COLS` donde cada celda guarda `0` (vacía) o un índice de color (1–7) que identifica la pieza.
- **Piezas**: definidas como matrices cuadradas. Para rotar se calcula la transposición + reverso de filas (`rotateCW`).
- **Detección de colisiones** (`collide`): comprueba que ninguna celda de la pieza salga del tablero ni se solape con bloques ya fijados.
- **Wall kicks** (`tryRotate`): si la rotación choca, intenta desplazar la pieza ±1 y ±2 columnas antes de descartar el giro.
- **Game loop** (`loop`): basado en `requestAnimationFrame`, acumula el tiempo transcurrido y baja la pieza una fila cuando se supera `dropInterval`.
- **Limpieza de líneas** (`clearLines`): recorre el tablero de abajo hacia arriba; cada fila completa se elimina y se inserta una vacía en la cima.
- **Puntuación**: usa la tabla clásica `[0, 100, 300, 500, 800]` multiplicada por el nivel actual; el hard drop suma 2 puntos por celda recorrida y el soft drop 1 punto por fila.
- **Nivel y velocidad**: la partida empieza en `startLevel` (1 por defecto, elegible en el menú de pausa) y sube un nivel cada 10 líneas (`level = nivel inicial + floor(lines / 10)`); la velocidad de caída se calcula como `max(100, 1000 − (level − 1) × 90)` milisegundos.
- **Menú de pausa** (`togglePause`): cancela el bucle y muestra el overlay con el menú; mientras está abierto el `keydown` solo atiende `P`/`Escape`. Al reanudar o reiniciar se ignoran las repeticiones de teclas que seguían pulsadas y se quita el foco del botón pulsado.
- **Ghost piece** (`ghostY`): proyecta la posición final de la pieza actual hacia abajo y la dibuja con `globalAlpha = 0.2`.
- **Hold** (`holdPiece`): guarda la pieza actual (sin rotación) o la intercambia con la reservada. Solo se puede usar una vez por pieza; el slot se atenúa hasta que la pieza se fija.
- **Récords** (`loadRecords`, `addRecord`, `qualifies`): se guardan en `localStorage` bajo la clave `tetris-records` como `{ top: [{ name, score, lines }], bestCombo, maxLines }`. Si el JSON está corrupto o el almacenamiento no está disponible, se empieza con la tabla vacía.

### Flujo del juego

```
init()
  ├─ createBoard()                  → matriz vacía
  ├─ next = randomPiece()
  ├─ spawn()                        → mueve next a current y genera nueva next
  └─ requestAnimationFrame(loop)
        ↓
   loop(timestamp)
     ├─ acumula dt
     ├─ si dt ≥ dropInterval → baja la pieza o llama a lockPiece()
     ├─ draw()  (grid + tablero + ghost + pieza actual)
     └─ requestAnimationFrame(loop)

   keydown → mover / rotar / soft-drop / hard-drop / hold / pausa (P o Escape)
```

Al cargar, tras `init()` se llama a `showStart()`, que detiene el bucle y muestra la pantalla de inicio hasta pulsar **Jugar**.

Cuando una pieza recién generada ya colisiona al aparecer (`spawn`), se dispara `endGame()`: guarda el mejor combo y las líneas máximas, y muestra el overlay de **Game Over** con los récords (y el campo de nombre si la puntuación entra en el top 5).

---

## Tecnologías

- **HTML5** — marcado y tres elementos `<canvas>` (tablero, hold y vista previa).
- **CSS3** — _flexbox_, variables de color, `backdrop-filter` y `box-shadow`.
- **JavaScript (ES6+) vanilla** — `const`/`let`, _arrow functions_, _spread operator_, `Array.from`, _template literals_…
- **Canvas 2D API** — para todo el renderizado del juego.
- **`requestAnimationFrame`** — para el bucle de juego sincronizado con el navegador.

**Sin dependencias.** No hay `package.json`, ni bundler, ni transpilador.

---

## Estructura del proyecto

```
03-tetris/
├── index.html      # Estructura del DOM y canvas
├── style.css       # Estilos del juego (dark theme)
├── game.js         # Toda la lógica del Tetris (~300 líneas)
├── tests/
│   └── game.test.mjs  # Tests sin dependencias (node --test)
└── README.md
```

---

## Personalización

Algunos parámetros fáciles de tunear en `game.js`:

| Constante      | Significado                              | Por defecto           |
| -------------- | ---------------------------------------- | --------------------- |
| `COLS`         | Columnas del tablero                     | `10`                  |
| `ROWS`         | Filas del tablero                        | `20`                  |
| `BLOCK`        | Tamaño en píxeles de cada celda          | `30`                  |
| `COLORS`       | Paleta de colores por tipo de pieza      | 7 colores             |
| `LINE_SCORES`  | Puntos por 1, 2, 3 o 4 líneas eliminadas | `[0,100,300,500,800]` |
| `dropInterval` | Velocidad inicial de caída en ms         | `1000`                |

> Si cambias `COLS`, `ROWS` o `BLOCK`, recuerda ajustar también `width` y `height` del `<canvas id="board">` en `index.html` para que coincida (`COLS × BLOCK` × `ROWS × BLOCK`).

---

## Licencia

Proyecto de uso libre con fines educativos y de práctica.
